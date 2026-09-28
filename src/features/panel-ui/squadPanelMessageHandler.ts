import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { LoggingService } from "../../shared/services/loggingService";
import { ExtensionMessage, WebviewMessage } from "./types/webviewMessages";
import {
  SquadCharter,
  SquadDetectionResult,
  SquadDocKind,
  SquadError,
  SquadMarketplaceRef,
  SquadPluginRef,
  SquadResult,
  SquadRosterMember,
  SquadUpstreamSource,
  isSquadErr,
} from "../squad/models";
import { SquadFileService, SquadLogKind as SquadFileLogKind } from "../squad/services/squadFileService";
import { SquadControlledWriteOutcome } from "../squad/services/squadFileWriteService";
import { SquadPluginService } from "../squad/services/squadPluginService";
import { SquadLogDocument, SquadLogKind } from "./webview/types/squadState";

interface SquadPluginInventory {
  marketplaces: SquadMarketplaceRef[];
  plugins: SquadPluginRef[];
  error?: SquadError;
}

/**
 * Routes Squad webview requests (SQD-007 contract) to the Squad detection and
 * file services, posting the contract's response messages back to the webview
 * (SQD-008, PRD FR-020/FR-021).
 *
 * The extension host's {@link NexkitPanelMessageHandler} owns the message map
 * and delegates every `squad*` command to this class so the top-level handler
 * stays thin. Every routed message ends in exactly one of the contract's
 * response types; failures always surface as a structured, actionable
 * {@link SquadError} via `squadError` — never a silent success.
 *
 * Write-back flows (`saveSquadCharter`, `saveSquadDoc`) are delegated to the
 * controlled write service, which invokes BackupService before every write
 * (SQD-026, FR-006/FR-023). Squad Doctor (`runSquadDoctor`) is wired to
 * {@link SquadCliService} (SQD-021).
 */
export class SquadPanelMessageHandler {
  private readonly _logger: LoggingService;

  constructor(
    private readonly _services: ServiceContainer,
    private readonly _postMessage: (message: ExtensionMessage) => void
  ) {
    this._logger = _services.logging;
  }

  /**
   * Route a Squad webview message. Returns `true` when the command was a Squad
   * command handled here, `false` otherwise so the caller can fall through.
   */
  public async handle(message: WebviewMessage): Promise<boolean> {
    switch (message.command) {
      case "getSquadState":
        await this.handleGetSquadState();
        return true;
      case "refreshSquadDetection":
        await this.handleRefreshSquadDetection();
        return true;
      case "checkSquadUpdates":
        await this.handleCheckSquadUpdates();
        return true;
      case "saveSquadCharter":
        await this.handleSaveSquadCharter(message);
        return true;
      case "saveSquadDoc":
        await this.handleSaveSquadDoc(message);
        return true;
      case "runSquadDoctor":
        await this.handleRunSquadDoctor();
        return true;
      case "exportSquad":
        await this.handleExportSquad(message);
        return true;
      case "refreshSquadPlugins":
        await this.handleRefreshSquadPlugins();
        return true;
      default:
        return false;
    }
  }

  // --- routed handlers --------------------------------------------------

  /**
   * Full refresh: emit status, then roster, docs and logs as available.
   * Detection is the authoritative success/error gate; sub-reads degrade
   * gracefully but any failure is surfaced through `squadError`.
   */
  private async handleGetSquadState(): Promise<void> {
    const detection = await this._services.squadDetection.detect(this._workspaceRoot());
    if (isSquadErr(detection)) {
      this._emitError(detection.error);
      return;
    }

    let firstError: SquadError | undefined;
    const fileService = this._services.squadFile;
    const upstreams = fileService ? await this._readUpstreams(fileService, (error) => (firstError ??= error)) : [];
    const pluginInventory = await this._readPluginInventory(this._services.squadPlugins);
    if (pluginInventory.error) {
      firstError ??= pluginInventory.error;
    }
    this._emitStatus(detection.value, upstreams, pluginInventory.marketplaces, pluginInventory.plugins);

    if (!fileService) {
      if (firstError) {
        this._emitError(firstError);
      }
      return;
    }

    const roster = this._unwrap(await fileService.readRoster(), (error) => (firstError ??= error)) ?? [];
    const charters = await this._readCharters(fileService, roster, (error) => (firstError ??= error));
    this._postMessage({ command: "squadRosterUpdate", roster, charters });

    const decisions = this._unwrap(await fileService.readDecisions(), (error) => (firstError ??= error)) ?? null;
    const routing = this._unwrap(await fileService.readRouting(), (error) => (firstError ??= error)) ?? null;
    this._postMessage({ command: "squadDocsUpdate", decisions, routing });

    const logs = await this._collectLogs(fileService, roster, (error) => (firstError ??= error));
    this._postMessage({ command: "squadLogsUpdate", logs });

    if (firstError) {
      this._emitError(firstError);
    }
  }

  /** Re-run detection, wrapping the work with a loading state. */
  private async handleRefreshSquadDetection(): Promise<void> {
    this._setLoading(true);
    try {
      const detection = await this._services.squadDetection.detect(this._workspaceRoot());
      if (isSquadErr(detection)) {
        this._emitError(detection.error);
        return;
      }
      let upstreamError: SquadError | undefined;
      const fileService = this._services.squadFile;
      const upstreams = fileService ? await this._readUpstreams(fileService, (error) => (upstreamError = error)) : [];
      const pluginInventory = await this._readPluginInventory(this._services.squadPlugins);
      this._emitStatus(detection.value, upstreams, pluginInventory.marketplaces, pluginInventory.plugins);
      const error = upstreamError ?? pluginInventory.error;
      if (error) {
        this._emitError(error);
      }
    } finally {
      this._setLoading(false);
    }
  }

  /**
   * Check for CLI/project updates without executing upgrades (SQD-030,
   * FR-005). The returned contract is reusable by the follow-up confirmed
   * upgrade flows; failures surface as `squadError`, never as empty success.
   */
  private async handleCheckSquadUpdates(): Promise<void> {
    this._setLoading(true);
    try {
      const updates = await this._services.squadUpdates.checkUpdates(this._workspaceRoot());
      if (isSquadErr(updates)) {
        this._emitError(updates.error);
        return;
      }

      const fileService = this._services.squadFile;
      let upstreamError: SquadError | undefined;
      const upstreams = fileService ? await this._readUpstreams(fileService, (error) => (upstreamError = error)) : [];
      const pluginInventory = await this._readPluginInventory(this._services.squadPlugins);
      this._emitStatus(updates.value.detection, upstreams, pluginInventory.marketplaces, pluginInventory.plugins);
      this._postMessage({ command: "squadUpdatesUpdate", updates: updates.value });
      const error = upstreamError ?? pluginInventory.error;
      if (error) {
        this._emitError(error);
      }
    } finally {
      this._setLoading(false);
    }
  }

  /** Save an edited charter through the backup-first controlled write service. */
  private async handleSaveSquadCharter(message: Extract<WebviewMessage, { command: "saveSquadCharter" }>): Promise<void> {
    const writer = this._services.squadWrite;
    if (!writer) {
      this._emitNoWorkspaceWriteError();
      return;
    }

    this._setLoading(true);
    try {
      const result = await writer.saveCharter(message.agentId, message.content);
      if (isSquadErr(result)) {
        this._emitError(result.error);
        return;
      }

      this._postMessage({
        command: "squadCharterSaved",
        charter: result.value.charter,
        result: this._toWriteSummary(result.value),
      });
    } finally {
      this._setLoading(false);
    }
  }

  /** Save an edited governance doc through the backup-first controlled write service. */
  private async handleSaveSquadDoc(message: Extract<WebviewMessage, { command: "saveSquadDoc" }>): Promise<void> {
    const writer = this._services.squadWrite;
    if (!writer) {
      this._emitNoWorkspaceWriteError();
      return;
    }

    if (!this._isSupportedDocKind(message.kind)) {
      this._emitError({
        code: "file-write-failed",
        message: "Unsupported Squad document type.",
        remediation: "Refresh the Squad panel and try saving a supported document.",
        detail: String(message.kind),
      });
      return;
    }

    this._setLoading(true);
    try {
      const result = await writer.saveMarkdownDoc(message.kind, message.content);
      if (isSquadErr(result)) {
        this._emitError(result.error);
        return;
      }

      this._postMessage({
        command: "squadDocSaved",
        doc: result.value.doc,
        result: this._toWriteSummary(result.value),
      });
    } finally {
      this._setLoading(false);
    }
  }

  /**
   * Run Squad Doctor via the CLI service (SQD-021, FR-060). Emits
   * `squadDoctorUpdate` with the parsed report on success, or a structured,
   * actionable `squadError` (CLI missing, timeout, cancellation, non-zero
   * exit) on failure — never a silent success.
   */
  private async handleRunSquadDoctor(): Promise<void> {
    this._setLoading(true);
    try {
      const result = await this._services.squadCli.runDoctor({ cwd: this._workspaceRoot() });
      if (isSquadErr(result)) {
        this._emitError(result.error);
        return;
      }
      this._postMessage({ command: "squadDoctorUpdate", doctor: result.value });
    } finally {
      this._setLoading(false);
    }
  }

  /**
   * Export Squad via the dedicated service (SQD-033, FR-061). The service owns
   * the CLI invocation and any file picker; this host layer only preserves the
   * central webview message contract and visible error/loading behavior.
   */
  private async handleExportSquad(message: Extract<WebviewMessage, { command: "exportSquad" }>): Promise<void> {
    this._setLoading(true);
    try {
      const result = await this._services.squadExport.exportSquad(message.request ?? {});
      if (isSquadErr(result)) {
        this._emitError(result.error);
        return;
      }
      this._postMessage({ command: "squadExportResult", export: result.value });
    } finally {
      this._setLoading(false);
    }
  }

  /** Refresh plugin marketplaces and installed plugins without re-running full detection. */
  private async handleRefreshSquadPlugins(): Promise<void> {
    this._setLoading(true);
    try {
      const inventory = await this._readPluginInventory(this._services.squadPlugins);
      this._postMessage({
        command: "squadPluginsUpdate",
        marketplaces: inventory.marketplaces,
        plugins: inventory.plugins,
      });
      if (inventory.error) {
        this._emitError(inventory.error);
      }
    } finally {
      this._setLoading(false);
    }
  }

  // --- helpers ----------------------------------------------------------

  private async _readUpstreams(
    fileService: SquadFileService,
    onError: (error: SquadError) => void
  ): Promise<SquadUpstreamSource[]> {
    const result = await fileService.readUpstreams();
    if (isSquadErr(result)) {
      this._logger.warn("Squad: failed to read upstream sources", result.error);
      onError(result.error);
      return [];
    }
    return result.value;
  }

  private async _readPluginInventory(pluginService: SquadPluginService | undefined): Promise<SquadPluginInventory> {
    if (!pluginService) {
      return { marketplaces: [], plugins: [] };
    }

    let firstError: SquadError | undefined;

    const marketplacesResult = await pluginService.readMarketplaces();
    const marketplaces =
      this._unwrap(marketplacesResult, (error) => {
        this._logger.warn("Squad: failed to read plugin marketplaces", error);
        firstError ??= error;
      }) ?? [];

    const pluginsResult = await pluginService.listInstalledPlugins({ cwd: this._workspaceRoot() });
    const plugins =
      this._unwrap(pluginsResult, (error) => {
        this._logger.warn("Squad: failed to list installed plugins", error);
        firstError ??= error;
      }) ?? [];

    return { marketplaces, plugins, error: firstError };
  }

  private async _readCharters(
    fileService: SquadFileService,
    roster: SquadRosterMember[],
    onError: (error: SquadError) => void
  ): Promise<SquadCharter[]> {
    const charters: SquadCharter[] = [];
    for (const member of roster) {
      if (!member.hasCharter) {
        continue;
      }
      const result = await fileService.readCharter(member.id);
      if (isSquadErr(result)) {
        onError(result.error);
        continue;
      }
      charters.push(result.value);
    }
    return charters;
  }

  private async _collectLogs(
    fileService: SquadFileService,
    roster: SquadRosterMember[],
    onError: (error: SquadError) => void
  ): Promise<SquadLogDocument[]> {
    const logs: SquadLogDocument[] = [];

    for (const member of roster) {
      const history = await fileService.readAgentHistory(member.id);
      if (isSquadErr(history)) {
        // A missing agent history is non-fatal; note it and move on.
        onError(history.error);
        continue;
      }
      logs.push({
        kind: SquadLogKind.AgentHistory,
        agentId: member.id,
        relativePath: history.value.relativePath,
        content: history.value.content,
      });
    }

    await this._appendStreamLogs(fileService, SquadFileLogKind.Session, SquadLogKind.Log, logs, onError);
    await this._appendStreamLogs(fileService, SquadFileLogKind.Orchestration, SquadLogKind.Orchestration, logs, onError);

    return logs;
  }

  private async _appendStreamLogs(
    fileService: SquadFileService,
    sourceKind: SquadFileLogKind,
    targetKind: SquadLogKind,
    logs: SquadLogDocument[],
    onError: (error: SquadError) => void
  ): Promise<void> {
    const refs = await fileService.listLogs(sourceKind);
    if (isSquadErr(refs)) {
      onError(refs.error);
      return;
    }
    for (const ref of refs.value) {
      const content = await fileService.readLog(sourceKind, ref.name);
      if (isSquadErr(content)) {
        onError(content.error);
        continue;
      }
      logs.push({
        kind: targetKind,
        relativePath: content.value.relativePath,
        content: content.value.content,
      });
    }
  }

  private _emitStatus(
    detection: SquadDetectionResult,
    upstreams: SquadUpstreamSource[],
    marketplaces: SquadMarketplaceRef[],
    plugins: SquadPluginRef[]
  ): void {
    this._postMessage({ command: "squadStatusUpdate", detection, upstreams, marketplaces, plugins });
  }

  private _emitError(error: SquadError): void {
    this._postMessage({ command: "squadError", error });
  }

  private _emitNoWorkspaceWriteError(): void {
    this._emitError({
      code: "not-a-workspace",
      message: "Cannot save Squad files without an open workspace folder.",
      remediation: "Open the repository containing .squad/, then try saving again.",
    });
  }

  private _setLoading(isLoading: boolean): void {
    this._postMessage({ command: "squadLoading", isLoading });
  }

  private _unwrap<T>(result: SquadResult<T>, onError: (error: SquadError) => void): T | undefined {
    if (isSquadErr(result)) {
      onError(result.error);
      return undefined;
    }
    return result.value;
  }

  private _toWriteSummary(result: SquadControlledWriteOutcome): {
    relativePath: string;
    created: boolean;
    backupCreated: boolean;
    bytesWritten: number;
  } {
    return {
      relativePath: result.relativePath,
      created: result.created,
      backupCreated: result.backupPath !== null,
      bytesWritten: result.bytesWritten,
    };
  }

  private _isSupportedDocKind(kind: SquadDocKind): kind is SquadDocKind {
    return kind === SquadDocKind.Decisions || kind === SquadDocKind.Routing;
  }

  private _workspaceRoot(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }
}
