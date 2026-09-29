import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { LoggingService } from "../../shared/services/loggingService";
import { ExtensionMessage, WebviewMessage } from "./types/webviewMessages";
import { SquadError, SquadResult, SquadUpstreamOperation, SquadUpstreamSource, isSquadErr } from "../squad/models";
import {
  SquadFeatureTelemetryEvent,
  SquadTelemetryFeature,
  SquadTelemetryOutcome,
} from "../squad/services/squadTelemetryService";
import type { SquadUpstreamOperationOutcome } from "../squad/services/squadUpstreamService";

/**
 * Routes Squad upstream requests (SQD-036 / #251, PRD FR-031/FR-032) to
 * {@link SquadUpstreamService}, which runs `squad upstream list | add | sync |
 * remove` through the allowlisted Squad CLI.
 *
 * Contract: every routed message posts `squadUpstreamOperationStarted`, then
 * exactly one `squadUpstreamOperationResult` carrying the upstreams re-read
 * from `.squad/upstream.json` — also on failure, so partially applied changes
 * stay visible. Failures set `ok: false` with an actionable {@link SquadError};
 * they never look like a success.
 */
export class SquadUpstreamMessageHandler {
  private readonly _logger: LoggingService;

  constructor(
    private readonly _services: ServiceContainer,
    private readonly _postMessage: (message: ExtensionMessage) => void,
    private readonly _workspaceRoot: () => vscode.Uri | undefined = () => vscode.workspace.workspaceFolders?.[0]?.uri
  ) {
    this._logger = _services.logging;
  }

  /**
   * Route a Squad upstream message. Returns `true` when the command was handled
   * here, `false` otherwise so the caller can fall through.
   */
  public async handle(message: WebviewMessage): Promise<boolean> {
    switch (message.command) {
      case "listSquadUpstreams":
        await this._runOperation(SquadUpstreamOperation.List, undefined, (root) => this._services.squadUpstream.list(root));
        return true;
      case "addSquadUpstream":
        await this._runOperation(SquadUpstreamOperation.Add, message.name, (root) =>
          this._services.squadUpstream.add(root, { source: message.source, name: message.name, ref: message.ref })
        );
        return true;
      case "syncSquadUpstream":
        await this._runOperation(SquadUpstreamOperation.Sync, message.name, (root) =>
          this._services.squadUpstream.sync(root, message.name)
        );
        return true;
      case "removeSquadUpstream":
        await this._runOperation(SquadUpstreamOperation.Remove, message.name, (root) =>
          this._services.squadUpstream.remove(root, message.name)
        );
        return true;
      default:
        return false;
    }
  }

  private async _runOperation(
    operation: SquadUpstreamOperation,
    name: string | undefined,
    run: (root: vscode.Uri | undefined) => Promise<SquadResult<SquadUpstreamOperationOutcome>>
  ): Promise<void> {
    const root = this._workspaceRoot();
    this._postMessage({ command: "squadUpstreamOperationStarted", operation, name });

    let result: SquadResult<SquadUpstreamOperationOutcome>;
    try {
      result = await run(root);
    } catch (error) {
      this._logger.error(`Squad upstream ${operation}: unexpected failure`, error);
      result = {
        ok: false,
        error: {
          code: "unknown",
          message: "The Squad upstream operation failed unexpectedly.",
          remediation: "Check the Nexkit output channel for details and try again.",
          cause: error,
        },
      };
    }

    if (!isSquadErr(result)) {
      this._postMessage({
        command: "squadUpstreamOperationResult",
        operation,
        name: result.value.name ?? name,
        ok: true,
        upstreams: result.value.upstreams,
      });
      this._trackTelemetry({
        feature: SquadTelemetryFeature.Upstreams,
        action: "operation",
        outcome: SquadTelemetryOutcome.Success,
        properties: {
          operation,
          hasUpstreams: result.value.upstreams.length > 0,
          hasWorkspace: root !== undefined,
        },
        measurements: { upstreamCount: result.value.upstreams.length },
      });
      return;
    }

    const upstreams = await this._currentUpstreams(root);
    this._postMessage({
      command: "squadUpstreamOperationResult",
      operation,
      name,
      ok: false,
      upstreams,
      error: this._toWebviewError(result.error),
    });
    this._trackTelemetry({
      feature: SquadTelemetryFeature.Upstreams,
      action: "operation",
      outcome: result.error.code === "cancelled" ? SquadTelemetryOutcome.Cancelled : SquadTelemetryOutcome.Failure,
      errorCode: result.error.code,
      properties: {
        operation,
        hasUpstreams: upstreams.length > 0,
        hasWorkspace: root !== undefined,
      },
      measurements: { upstreamCount: upstreams.length },
    });
  }

  /** Best-effort re-read after a failure so partial changes remain visible. */
  private async _currentUpstreams(root: vscode.Uri | undefined): Promise<SquadUpstreamSource[]> {
    if (!root) {
      return [];
    }
    try {
      const result = await this._services.squadUpstream.readUpstreams(root);
      return isSquadErr(result) ? [] : result.value;
    } catch (error) {
      this._logger.warn("Squad upstream: failed to re-read upstreams after an error", error);
      return [];
    }
  }

  /** Drop the non-serializable `cause` before posting to the webview. */
  private _toWebviewError(error: SquadError): SquadError {
    const { cause: _cause, ...serializable } = error;
    return serializable;
  }

  private _trackTelemetry(event: SquadFeatureTelemetryEvent): void {
    this._services.squadTelemetry?.trackFeatureUsage(event);
  }
}
