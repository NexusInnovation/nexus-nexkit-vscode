import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { LoggingService } from "../../shared/services/loggingService";
import { ExtensionMessage, WebviewMessage } from "./types/webviewMessages";
import { SquadError, isSquadErr } from "../squad/models";
import { SquadCeremonyService, SquadCommandExecutor } from "../squad/services/squadCeremonyService";

/**
 * Routes Squad ceremony quick actions (SQD-047 / #262, PRD FR-055) to
 * {@link SquadCeremonyService}.
 *
 * Contract:
 * - `getSquadCeremonies` → `squadCeremoniesLoading` (true/false) around exactly
 *   one `squadCeremoniesUpdate` or `squadCeremoniesError`.
 * - `runSquadCeremony` → `squadCeremonyActionStarted`, then exactly one
 *   `squadCeremonyActionResult`; `ok: false` always carries an actionable error.
 * - `openSquadCeremonies` → opens the file; failures post `squadCeremoniesError`.
 */
export class SquadCeremonyMessageHandler {
  private readonly _logger: LoggingService;

  constructor(
    private readonly _services: ServiceContainer,
    private readonly _postMessage: (message: ExtensionMessage) => void,
    private readonly _workspaceRoot: () => vscode.Uri | undefined = () => vscode.workspace.workspaceFolders?.[0]?.uri,
    private readonly _executeCommand?: SquadCommandExecutor
  ) {
    this._logger = _services.logging;
  }

  /** Returns `true` when the message was a ceremony command handled here. */
  public async handle(message: WebviewMessage): Promise<boolean> {
    switch (message.command) {
      case "getSquadCeremonies":
        await this._handleList();
        return true;
      case "runSquadCeremony":
        await this._handleRun(message.ceremonyId);
        return true;
      case "openSquadCeremonies":
        await this._handleOpen();
        return true;
      default:
        return false;
    }
  }

  private async _handleList(): Promise<void> {
    this._postMessage({ command: "squadCeremoniesLoading", isLoading: true });
    try {
      const result = await this._service().listCeremonies();
      if (isSquadErr(result)) {
        this._postMessage({ command: "squadCeremoniesError", error: this._serializable(result.error) });
        return;
      }
      this._postMessage({ command: "squadCeremoniesUpdate", ceremonies: result.value });
    } catch (error) {
      this._logger.error("Squad ceremonies: unexpected failure while listing", error);
      this._postMessage({ command: "squadCeremoniesError", error: this._unexpected("read the Squad ceremonies") });
    } finally {
      this._postMessage({ command: "squadCeremoniesLoading", isLoading: false });
    }
  }

  private async _handleRun(ceremonyId: string): Promise<void> {
    this._postMessage({ command: "squadCeremonyActionStarted", ceremonyId });
    try {
      const result = await this._service().runCeremony(ceremonyId);
      if (isSquadErr(result)) {
        this._logger.warn("Squad ceremonies: launch failed", result.error.code);
        this._postMessage({
          command: "squadCeremonyActionResult",
          ceremonyId,
          ok: false,
          error: this._serializable(result.error),
        });
        return;
      }
      this._postMessage({ command: "squadCeremonyActionResult", ceremonyId, ok: true });
    } catch (error) {
      this._logger.error("Squad ceremonies: unexpected failure while launching", error);
      this._postMessage({
        command: "squadCeremonyActionResult",
        ceremonyId,
        ok: false,
        error: this._unexpected("start the ceremony"),
      });
    }
  }

  private async _handleOpen(): Promise<void> {
    try {
      const result = await this._service().openCeremoniesFile();
      if (isSquadErr(result)) {
        this._postMessage({ command: "squadCeremoniesError", error: this._serializable(result.error) });
      }
    } catch (error) {
      this._logger.error("Squad ceremonies: unexpected failure while opening the file", error);
      this._postMessage({ command: "squadCeremoniesError", error: this._unexpected("open .squad/ceremonies.md") });
    }
  }

  private _service(): SquadCeremonyService {
    return new SquadCeremonyService(this._workspaceRoot(), this._services.squadFile, this._executeCommand);
  }

  private _unexpected(action: string): SquadError {
    return {
      code: "ceremony-failed",
      message: `NexKit could not ${action}.`,
      remediation: "Check the Nexkit output channel for details and try again.",
    };
  }

  /** Drop the non-serializable `cause` before posting to the webview. */
  private _serializable(error: SquadError): SquadError {
    const { cause: _cause, ...serializable } = error;
    return serializable;
  }
}
