import * as fs from "fs";
import * as vscode from "vscode";
import { DevOpsConnection } from "../apm-devops/models/devOpsConnection";
import { LoggingService } from "../../shared/services/loggingService";
import { TelemetryService } from "../../shared/services/telemetryService";
import { IDevOpsAuthProvider } from "./devOpsAuthProvider";
import { BuildLogViewService } from "./buildLogViewService";
import {
  DevOpsApiError,
  DevOpsBuildsClient,
  DevOpsProjectRef,
  PipelineSource,
  RawBuild,
  buildWebUrl,
} from "./devOpsBuildsClient";
import {
  ResolvedRequester,
  isActiveStatus,
  requesterNeedsAuthor,
  resolveRequester,
  shortBranchName,
  toBuildDetail,
  toBuildSummary,
  toPipelineSummary,
  toStageSummaries,
} from "./buildMapper";
import { BuildSummary, HostToWebviewMessage, StageSummary, WebviewToHostMessage } from "./messages";

const ACTIVE_POLL_INTERVAL_MS = 10_000;
const IDLE_POLL_INTERVAL_MS = 30_000;
const TIMELINE_CONCURRENCY = 5;
const PROJECT_CHANGED_MESSAGE = "The active Azure DevOps project changed. Reopen the dialog to continue.";

function projectLabelOf(ref: DevOpsProjectRef): string {
  return `${ref.organization}/${ref.project}`;
}

export interface IDevOpsConnectionSource {
  getActiveConnection(): Promise<DevOpsConnection | null>;
  onConnectionsChanged: vscode.Event<void>;
}

/**
 * Manages the Azure DevOps builds webview panel shown in the editor area
 */
export class DevOpsPipelinesPanelService implements vscode.Disposable {
  private static readonly VIEW_TYPE = "nexkitDevOpsPipelines";
  private static readonly PANEL_TITLE = "Nexkit: Azure DevOps Builds";

  private _panel?: vscode.WebviewPanel;
  private _pollTimer?: NodeJS.Timeout;
  private _refreshing = false;
  private _builds: BuildSummary[] = [];
  private _selectedBuildId?: number;
  private _currentRef?: DevOpsProjectRef;
  private readonly _stageCache = new Map<number, StageSummary[]>();
  private readonly _dependencyCache = new Map<number, Map<string, string[]>>();
  private readonly _requesterCache = new Map<number, ResolvedRequester>();
  private readonly _avatarCache = new Map<string, string | undefined>();
  private readonly _connectionListener: vscode.Disposable;

  public constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _connections: IDevOpsConnectionSource,
    private readonly _client: DevOpsBuildsClient,
    private readonly _auth: IDevOpsAuthProvider,
    private readonly _logging: LoggingService,
    private readonly _telemetry: TelemetryService,
    private readonly _buildLog: BuildLogViewService
  ) {
    this._connectionListener = this._connections.onConnectionsChanged(() => {
      this._resetData();
      if (this._panel) {
        void this._refresh();
      }
    });
  }

  public openPanel(): void {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    this._telemetry.trackEvent("devopsPipelines.opened");

    const panel = vscode.window.createWebviewPanel(
      DevOpsPipelinesPanelService.VIEW_TYPE,
      DevOpsPipelinesPanelService.PANEL_TITLE,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "out")],
      }
    );
    this._panel = panel;

    void this._buildWebviewHtml(panel.webview).then((html) => {
      panel.webview.html = html;
    });

    const messageListener = panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
      void this._handleWebviewMessage(message);
    });

    const viewStateListener = panel.onDidChangeViewState(() => {
      if (panel.visible) {
        void this._refresh();
      } else {
        this._clearTimer();
      }
    });

    panel.onDidDispose(() => {
      messageListener.dispose();
      viewStateListener.dispose();
      this._clearTimer();
      this._panel = undefined;
      this._resetData();
    });
  }

  public dispose(): void {
    this._connectionListener.dispose();
    this._clearTimer();
    this._panel?.dispose();
    this._panel = undefined;
  }

  private async _handleWebviewMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case "webview-ready":
      case "refresh":
        await this._refresh();
        break;
      case "sign-in":
        await this._signIn();
        break;
      case "select-build":
        this._selectedBuildId = message.buildId;
        await this._loadDetail(message.buildId);
        break;
      case "deselect-build":
        this._selectedBuildId = undefined;
        break;
      case "cancel-build":
        await this._cancelBuild(message.buildId);
        break;
      case "open-log":
        await this._openLog(message.buildId, message.recordId);
        break;
      case "open-in-browser":
        if (this._currentRef) {
          await vscode.env.openExternal(vscode.Uri.parse(buildWebUrl(this._currentRef, message.buildId)));
        }
        break;
      case "load-pipelines":
        await this._loadPipelines();
        break;
      case "prepare-run":
        await this._prepareRun(message.requestId, message.project, message.pipelineId);
        break;
      case "run-pipeline":
        await this._runPipeline(message.requestId, message.project, message.pipelineId, message.branch);
        break;
    }
  }

  private async _loadPipelines(): Promise<void> {
    const ref = this._currentRef ?? (await this._resolveRef());
    if (!ref) {
      return;
    }
    const project = projectLabelOf(ref);
    try {
      const pipelines = await this._client.listPipelines(ref);
      this._post({ type: "pipelines", project, pipelines: pipelines.map(toPipelineSummary) });
    } catch (error) {
      this._logging.warn("Could not list the Azure DevOps pipelines", error);
      this._post({ type: "pipelines-error", project, message: this._describeError(error) });
    }
  }

  /** The project the webview asked about, or undefined when it is no longer the active one */
  private async _resolveRunRef(project: string): Promise<DevOpsProjectRef | undefined> {
    const ref = this._currentRef ?? (await this._resolveRef());
    return ref && projectLabelOf(ref) === project ? ref : undefined;
  }

  /** Resolves the branches offered by the Run dialog; free typing stays possible when they cannot be listed */
  private async _prepareRun(requestId: number, project: string, pipelineId: number): Promise<void> {
    const ref = await this._resolveRunRef(project);
    if (!ref) {
      this._post({ type: "run-result", requestId, pipelineId, success: false, message: PROJECT_CHANGED_MESSAGE });
      return;
    }

    let source: PipelineSource = {};
    let branches: string[] = [];
    try {
      source = await this._client.getPipelineSource(ref, pipelineId);
      if (source.repositoryType === "TfsGit" && source.repositoryId) {
        branches = await this._client.listBranches(ref, source.repositoryId);
      }
    } catch (error) {
      this._logging.warn(`Could not load the branches of pipeline ${pipelineId}`, error);
    }

    const defaultBranch = shortBranchName(source.defaultBranch);
    const names = branches.map(shortBranchName);
    const ordered = defaultBranch ? [defaultBranch, ...names.filter((n) => n !== defaultBranch)] : names;
    this._post({ type: "run-options", requestId, options: { pipelineId, branches: ordered, defaultBranch } });
  }

  private async _runPipeline(requestId: number, project: string, pipelineId: number, branch: string): Promise<void> {
    const name = branch.trim();
    if (!name) {
      return;
    }
    const ref = await this._resolveRunRef(project);
    if (!ref) {
      this._post({ type: "run-result", requestId, pipelineId, success: false, message: PROJECT_CHANGED_MESSAGE });
      return;
    }

    try {
      const sourceBranch = name.startsWith("refs/") ? name : `refs/heads/${name}`;
      const build = await this._client.runPipeline(ref, pipelineId, sourceBranch);
      this._telemetry.trackEvent("devopsPipelines.runPipeline");
      this._post({ type: "run-result", requestId, pipelineId, success: true, buildId: build.id });
    } catch (error) {
      this._logging.warn(`Could not run pipeline ${pipelineId}`, error);
      this._post({ type: "run-result", requestId, pipelineId, success: false, message: this._describeError(error) });
      return;
    }
    await this._refresh();
  }

  private async _signIn(): Promise<void> {
    try {
      await this._auth.getAccessToken(true);
    } catch (error) {
      this._logging.warn("Azure DevOps sign-in was not completed", error);
    }
    await this._refresh();
  }

  private async _openLog(buildId: number, recordId: string): Promise<void> {
    const ref = this._currentRef ?? (await this._resolveRef());
    if (!ref) {
      return;
    }
    const buildNumber = this._builds.find((b) => b.id === buildId)?.buildNumber ?? String(buildId);
    try {
      this._telemetry.trackEvent("devopsPipelines.openLog");
      await this._buildLog.open(ref, buildId, buildNumber, recordId);
    } catch (error) {
      this._logging.warn(`Could not open log for build ${buildId}`, error);
      void vscode.window.showWarningMessage(`Could not open the build log: ${this._describeError(error)}`);
    }
  }

  private _resetData(): void {
    this._builds = [];
    this._selectedBuildId = undefined;
    this._currentRef = undefined;
    this._stageCache.clear();
    this._dependencyCache.clear();
    this._requesterCache.clear();
    this._avatarCache.clear();
  }

  /** Dependencies come from a YAML preview; finished runs never change so they are cached */
  private async _getDependencies(ref: DevOpsProjectRef, raw: RawBuild): Promise<Map<string, string[]> | undefined> {
    const cached = this._dependencyCache.get(raw.id);
    if (cached) {
      return cached;
    }
    try {
      const dependencies = await this._client.getStageDependencies(ref, raw);
      if (dependencies && raw.status === "completed") {
        this._dependencyCache.set(raw.id, dependencies);
      }
      return dependencies;
    } catch (error) {
      this._logging.warn(`Could not resolve stage dependencies for build ${raw.id}`, error);
      return undefined;
    }
  }

  private async _refresh(): Promise<void> {
    if (!this._panel || this._refreshing) {
      return;
    }
    this._refreshing = true;
    this._clearTimer();

    try {
      const connection = await this._connections.getActiveConnection();
      if (!connection) {
        this._resetData();
        this._post({ type: "view-state", state: "no-connection" });
        return;
      }

      const ref: DevOpsProjectRef = { organization: connection.organization, project: connection.project };
      if (this._currentRef && (this._currentRef.organization !== ref.organization || this._currentRef.project !== ref.project)) {
        this._resetData();
      }
      this._currentRef = ref;
      const projectLabel = projectLabelOf(ref);

      if (this._builds.length === 0) {
        this._post({ type: "view-state", state: "loading", projectLabel });
      }

      await this._loadBuilds(ref);
      this._post({ type: "view-state", state: "ready", projectLabel });

      if (this._selectedBuildId !== undefined) {
        await this._loadDetail(this._selectedBuildId);
      }
    } catch (error) {
      this._reportError(error);
    } finally {
      this._refreshing = false;
      this._scheduleNextPoll();
    }
  }

  private async _loadBuilds(ref: DevOpsProjectRef): Promise<void> {
    const rawBuilds = await this._client.listBuilds(ref);
    this._builds = rawBuilds.map((raw) => toBuildSummary(raw, this._stageCache.get(raw.id), this._requesterCache.get(raw.id)));
    this._postBuilds();

    // Finished builds never change, so only unknown or still-active ones need a timeline
    const needsTimeline = this._builds.filter((b) => isActiveStatus(b.status) || !this._stageCache.has(b.id));
    const needsRequester = rawBuilds.filter((raw) => !this._requesterCache.has(raw.id));
    await Promise.all([
      this._runWithConcurrency(needsTimeline, async (build) => {
        try {
          const timeline = await this._client.getTimeline(ref, build.id);
          const stages = toStageSummaries(timeline);
          if (!isActiveStatus(build.status)) {
            this._stageCache.set(build.id, stages);
          }
          build.stages = stages;
        } catch (error) {
          this._logging.warn(`Could not load stages for build ${build.id}`, error);
        }
      }),
      this._runWithConcurrency(needsRequester, async (raw) => {
        const requester = await this._resolveRequester(ref, raw);
        const build = this._builds.find((b) => b.id === raw.id);
        if (build) {
          build.requestedFor = requester.name;
          build.requestedForImage = requester.image;
        }
      }),
    ]);
    this._postBuilds();
  }

  /** Names the real person behind a build and downloads their avatar; finished builds are cached */
  private async _resolveRequester(ref: DevOpsProjectRef, raw: RawBuild): Promise<ResolvedRequester> {
    let requester: ResolvedRequester;
    try {
      const author = requesterNeedsAuthor(raw) ? await this._client.getBuildAuthor(ref, raw.id) : undefined;
      const resolved = resolveRequester(raw, author);
      requester = { name: resolved.name, image: resolved.imageUrl ? await this._getAvatar(resolved.imageUrl) : undefined };
    } catch (error) {
      this._logging.warn(`Could not resolve the requester of build ${raw.id}`, error);
      return { name: resolveRequester(raw).name };
    }
    if (raw.status === "completed") {
      this._requesterCache.set(raw.id, requester);
    }
    return requester;
  }

  private async _getAvatar(url: string): Promise<string | undefined> {
    if (!this._avatarCache.has(url)) {
      this._avatarCache.set(url, await this._client.getAvatarDataUri(url));
    }
    return this._avatarCache.get(url);
  }

  private async _loadDetail(buildId: number): Promise<void> {
    const ref = this._currentRef ?? (await this._resolveRef());
    if (!ref) {
      return;
    }

    try {
      const [raw, timeline] = await Promise.all([this._client.getBuild(ref, buildId), this._client.getTimeline(ref, buildId)]);
      const dependencies = await this._getDependencies(ref, raw);
      const requester = this._requesterCache.get(buildId) ?? (await this._resolveRequester(ref, raw));
      if (this._selectedBuildId === buildId) {
        this._post({ type: "build-detail", detail: toBuildDetail(raw, timeline, dependencies, requester) });
      }
    } catch (error) {
      this._logging.warn(`Could not load build ${buildId}`, error);
      if (this._selectedBuildId === buildId) {
        this._post({ type: "build-detail-error", buildId, message: this._describeError(error) });
      }
    }
  }

  private async _resolveRef(): Promise<DevOpsProjectRef | undefined> {
    const connection = await this._connections.getActiveConnection();
    return connection ? { organization: connection.organization, project: connection.project } : undefined;
  }

  private async _cancelBuild(buildId: number): Promise<void> {
    if (!this._currentRef) {
      return;
    }
    const ref = this._currentRef;
    const confirmLabel = "Cancel Build";
    const choice = await vscode.window.showWarningMessage(
      `Cancel build ${this._builds.find((b) => b.id === buildId)?.buildNumber ?? buildId}?`,
      { modal: true },
      confirmLabel
    );
    if (choice !== confirmLabel) {
      return;
    }

    try {
      await this._client.cancelBuild(ref, buildId);
      this._telemetry.trackEvent("devopsPipelines.cancelBuild");
      this._post({ type: "cancel-result", buildId, success: true, message: "Cancellation requested." });
    } catch (error) {
      this._logging.warn(`Could not cancel build ${buildId}`, error);
      this._post({ type: "cancel-result", buildId, success: false, message: this._describeError(error) });
    }
    await this._refresh();
  }

  private _reportError(error: unknown): void {
    this._logging.warn("Azure DevOps builds refresh failed", error);
    if (error instanceof DevOpsApiError && error.kind === "auth") {
      this._post({ type: "view-state", state: "needs-auth", message: error.message });
      return;
    }
    this._post({ type: "view-state", state: "error", message: this._describeError(error) });
  }

  private _describeError(error: unknown): string {
    return error instanceof Error ? error.message : "Unexpected error.";
  }

  private _postBuilds(): void {
    this._post({ type: "builds", builds: this._builds, updatedAt: Date.now() });
  }

  private _scheduleNextPoll(): void {
    this._clearTimer();
    if (!this._panel?.visible) {
      return;
    }
    const anyActive = this._builds.some((b) => isActiveStatus(b.status));
    this._pollTimer = setTimeout(() => void this._refresh(), anyActive ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS);
  }

  private _clearTimer(): void {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  private async _runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(TIMELINE_CONCURRENCY, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        await worker(item);
      }
    });
    await Promise.all(runners);
  }

  private _post(message: HostToWebviewMessage): void {
    void this._panel?.webview.postMessage(message);
  }

  private async _buildWebviewHtml(webview: vscode.Webview): Promise<string> {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, "out", "devops-pipelines", "index.html");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "out", "devOpsPipelines.js"));

    let html: string;
    try {
      html = await fs.promises.readFile(htmlPath.fsPath, "utf8");
    } catch (error) {
      this._logging.error(`Failed to read Azure DevOps builds webview HTML at ${htmlPath.fsPath}`, error);
      return "<!DOCTYPE html><html><body><h1>Unable to load Azure DevOps builds</h1><p>Please rebuild the extension and try again.</p></body></html>";
    }

    return html
      .replace(/\{\{nonce\}\}/g, this._getNonce())
      .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
      .replace(/\{\{cspSource\}\}/g, webview.cspSource);
  }

  private _getNonce(): string {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
