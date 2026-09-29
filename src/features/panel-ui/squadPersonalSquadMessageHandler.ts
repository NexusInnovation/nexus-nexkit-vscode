import { ServiceContainer } from "../../core/serviceContainer";
import { LoggingService } from "../../shared/services/loggingService";
import { ExtensionMessage, WebviewMessage } from "./types/webviewMessages";
import { SquadConsultModeOperation, SquadError, isSquadErr } from "../squad/models";

/**
 * Routes personal/global Squad commands (SQD-051 / FR-064).
 *
 * The host owns the explicit local-vs-personal warning and CLI invocation via
 * SquadPersonalSquadService. The webview only receives serialized status and
 * result messages so consult mode (#267) can reuse the same personal-squad
 * contract without reimplementing detection.
 */
export class SquadPersonalSquadMessageHandler {
  private readonly _logger: LoggingService;

  constructor(
    private readonly _services: ServiceContainer,
    private readonly _postMessage: (message: ExtensionMessage) => void
  ) {
    this._logger = _services.logging;
  }

  /** Return true when the command belongs to the personal Squad scenario. */
  public async handle(message: WebviewMessage): Promise<boolean> {
    switch (message.command) {
      case "getPersonalSquadStatus":
        await this.handleGetStatus();
        return true;
      case "initPersonalSquad":
        await this.handleInitialize();
        return true;
      case "getConsultModeStatus":
        await this.handleGetConsultStatus();
        return true;
      case "startSquadConsultMode":
        await this.handleStartConsultMode();
        return true;
      case "extractSquadConsultMode":
        await this.handleExtractConsultMode();
        return true;
      default:
        return false;
    }
  }

  private async handleGetStatus(): Promise<void> {
    this._postMessage({ command: "squadPersonalSquadLoading", isLoading: true });
    try {
      const status = await this._services.squadPersonal.getStatus();
      if (isSquadErr(status)) {
        this._logger.warn("Personal Squad: status failed", status.error);
        this._postMessage({ command: "squadPersonalSquadError", error: status.error });
        return;
      }
      this._postMessage({ command: "squadPersonalSquadStatusUpdate", status: status.value });
    } catch (error) {
      const squadError = this._unknownError("Reading personal Squad status failed unexpectedly.", error);
      this._logger.error("Personal Squad: status threw", squadError);
      this._postMessage({ command: "squadPersonalSquadError", error: squadError });
    } finally {
      this._postMessage({ command: "squadPersonalSquadLoading", isLoading: false });
    }
  }

  private async handleInitialize(): Promise<void> {
    this._postMessage({ command: "squadPersonalSquadLoading", isLoading: true });
    try {
      const result = await this._services.squadPersonal.initialize();
      if (isSquadErr(result)) {
        this._logger.warn("Personal Squad: init failed", result.error);
        this._postMessage({ command: "squadPersonalSquadInitResult", ok: false, error: result.error });
        return;
      }
      this._postMessage({ command: "squadPersonalSquadInitResult", ok: true, outcome: result.value });
      this._postMessage({ command: "squadPersonalSquadStatusUpdate", status: result.value.status });
    } catch (error) {
      const squadError = this._unknownError("Initializing personal Squad failed unexpectedly.", error);
      this._logger.error("Personal Squad: init threw", squadError);
      this._postMessage({ command: "squadPersonalSquadInitResult", ok: false, error: squadError });
    } finally {
      this._postMessage({ command: "squadPersonalSquadLoading", isLoading: false });
    }
  }

  private async handleGetConsultStatus(): Promise<void> {
    this._postMessage({ command: "squadConsultModeLoading", isLoading: true });
    try {
      const status = await this._services.squadConsult.getStatus();
      if (isSquadErr(status)) {
        this._logger.warn("Squad consult mode: status failed", status.error);
        this._postMessage({ command: "squadConsultModeError", error: status.error });
        return;
      }
      this._postMessage({ command: "squadConsultModeStatusUpdate", status: status.value });
    } catch (error) {
      const squadError = this._unknownError("Reading Squad consult mode status failed unexpectedly.", error);
      this._logger.error("Squad consult mode: status threw", squadError);
      this._postMessage({ command: "squadConsultModeError", error: squadError });
    } finally {
      this._postMessage({ command: "squadConsultModeLoading", isLoading: false });
    }
  }

  private async handleStartConsultMode(): Promise<void> {
    await this._runConsultOperation(SquadConsultModeOperation.Consult, () => this._services.squadConsult.startConsultMode());
  }

  private async handleExtractConsultMode(): Promise<void> {
    await this._runConsultOperation(SquadConsultModeOperation.Extract, () => this._services.squadConsult.extractLearnings());
  }

  private async _runConsultOperation(
    operation: SquadConsultModeOperation,
    run: () => ReturnType<ServiceContainer["squadConsult"]["startConsultMode"]>
  ): Promise<void> {
    this._postMessage({ command: "squadConsultModeLoading", isLoading: true });
    try {
      const result = await run();
      if (isSquadErr(result)) {
        this._logger.warn(`Squad consult mode: ${operation} failed`, result.error);
        this._postMessage({ command: "squadConsultModeResult", operation, ok: false, error: result.error });
        return;
      }
      this._postMessage({ command: "squadConsultModeResult", operation, ok: true, outcome: result.value });
      this._postMessage({ command: "squadConsultModeStatusUpdate", status: result.value.status });
    } catch (error) {
      const squadError = this._unknownError(`Squad ${operation} failed unexpectedly.`, error);
      this._logger.error(`Squad consult mode: ${operation} threw`, squadError);
      this._postMessage({ command: "squadConsultModeResult", operation, ok: false, error: squadError });
    } finally {
      this._postMessage({ command: "squadConsultModeLoading", isLoading: false });
    }
  }

  private _unknownError(message: string, error: unknown): SquadError {
    return {
      code: "unknown",
      message,
      remediation: "Check the Nexkit output channel for details, then retry.",
      detail: error instanceof Error ? error.message : String(error),
      cause: error,
    };
  }
}
