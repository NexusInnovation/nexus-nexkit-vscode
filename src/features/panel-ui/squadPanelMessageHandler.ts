import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { LoggingService } from "../../shared/services/loggingService";
import { ExtensionMessage, WebviewMessage } from "./types/webviewMessages";
import {
  SquadCharter,
  SquadDetectionResult,
  SquadError,
  SquadPluginRef,
  SquadResult,
  SquadRosterMember,
  SquadUpstreamSource,
  isSquadErr,
} from "../squad/models";
import {
  SquadFileService,
  SquadLogKind as SquadFileLogKind,
} from "../squad/services/squadFileService";
import { SquadLogDocument, SquadLogKind } from "./webview/types/squadState";

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
 * Write-back flows (`saveSquadCharter`, `saveSquadDoc`) depend on services
 * still in flight (a write service); they respond with a clear "not available
 * yet" {@link SquadError} rather than faking success. Squad Doctor
 * (`runSquadDoctor`) is wired to {@link SquadCliService} (SQD-021).
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
      case "saveSquadCharter":
        await this.handleSaveSquadCharter();
        return true;
      case "saveSquadDoc":
        await this.handleSaveSquadDoc();
        return true;
      case "runSquadDoctor":
        await this.handleRunSquadDoctor();
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

    const fileService = this._services.squadFile;
    const upstreams = fileService ? await this._readUpstreams(fileService) : [];
    this._emitStatus(detection.value, upstreams, []);

    if (!fileService) {
      return;
    }

    let firstError: SquadError | undefined;

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
      const fileService = this._services.squadFile;
      const upstreams = fileService ? await this._readUpstreams(fileService) : [];
      this._emitStatus(detection.value, upstreams, []);
    } finally {
      this._setLoading(false);
    }
  }

  /** Charter write-back is not available yet (write service in flight). */
  private async handleSaveSquadCharter(): Promise<void> {
    this._emitError({
      code: "file-write-failed",
      message: "Saving Squad charters is not available yet.",
      remediation: "Editing charters from the panel will be enabled in an upcoming NexKit release.",
    });
  }

  /** Governance-doc write-back is not available yet (write service in flight). */
  private async handleSaveSquadDoc(): Promise<void> {
    this._emitError({
      code: "file-write-failed",
      message: "Saving Squad documents is not available yet.",
      remediation: "Editing decisions/routing from the panel will be enabled in an upcoming NexKit release.",
    });
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

  // --- helpers ----------------------------------------------------------

  private async _readUpstreams(fileService: SquadFileService): Promise<SquadUpstreamSource[]> {
    const result = await fileService.readUpstreams();
    if (isSquadErr(result)) {
      this._logger.warn("Squad: failed to read upstream sources", result.error);
      return [];
    }
    return result.value;
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
    plugins: SquadPluginRef[]
  ): void {
    this._postMessage({ command: "squadStatusUpdate", detection, upstreams, plugins });
  }

  private _emitError(error: SquadError): void {
    this._postMessage({ command: "squadError", error });
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

  private _workspaceRoot(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }
}
