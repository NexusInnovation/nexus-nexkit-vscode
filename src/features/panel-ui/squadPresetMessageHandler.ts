import { ServiceContainer } from "../../core/serviceContainer";
import { LoggingService } from "../../shared/services/loggingService";
import { ExtensionMessage, WebviewMessage } from "./types/webviewMessages";
import { SquadError, isSquadErr } from "../squad/models";

/**
 * Routes the Squad preset selection screen requests (SQD-019 / #234) to the
 * aggregated preset provider and posts the discovery back to the webview
 * (PRD FR-010/FR-014/FR-015).
 *
 * The extension host's {@link NexkitPanelMessageHandler} owns the message map
 * and delegates the preset commands to this class so the top-level handler
 * stays thin. Every routed message ends in an explicit response: the discovered
 * presets (with rejected candidates and unreachable sources), a loading toggle,
 * or a structured, actionable {@link SquadError} — a failure never looks like an
 * empty success.
 *
 * The "initialise from preset" flow (SQD-020 / #235) is delegated to
 * {@link SquadInitService}: it re-validates the preset, asks for explicit user
 * confirmation, backs up existing Squad files, runs `squad init`, writes the
 * preset files with rollback on failure, and re-runs detection. Results are
 * returned to the webview via the additive `squadInitResult` message, and a
 * successful init also re-emits `squadStatusUpdate` so the tab flips to the
 * detected view.
 */
export class SquadPresetMessageHandler {
  private readonly _logger: LoggingService;

  constructor(
    private readonly _services: ServiceContainer,
    private readonly _postMessage: (message: ExtensionMessage) => void
  ) {
    this._logger = _services.logging;
  }

  /**
   * Route a Squad preset message. Returns `true` when the command was handled
   * here, `false` otherwise so the caller can fall through.
   */
  public async handle(message: WebviewMessage): Promise<boolean> {
    switch (message.command) {
      case "listSquadPresets":
        await this.handleListSquadPresets();
        return true;
      case "initSquadFromPreset":
        await this.handleInitSquadFromPreset(message.presetId);
        return true;
      default:
        return false;
    }
  }

  /**
   * Discover presets from every configured source and post the result. Source-
   * level failures and unexpected errors surface as `squadPresetsError`; per-
   * preset and per-source problems ride along in the discovery payload.
   */
  private async handleListSquadPresets(): Promise<void> {
    this._postMessage({ command: "squadPresetsLoading", isLoading: true });
    try {
      const result = await this._services.squadPresets.discoverPresets();
      if (isSquadErr(result)) {
        this._logger.warn("Squad: preset discovery failed", result.error);
        this._postMessage({ command: "squadPresetsError", error: result.error });
        return;
      }
      const { presets, rejected, unreachable } = result.value;
      this._postMessage({
        command: "squadPresetsDiscovered",
        presets,
        rejected,
        unreachable: unreachable ?? [],
      });
    } catch (error) {
      const squadError: SquadError = {
        code: "unknown",
        message: "Discovering Squad presets failed unexpectedly.",
        remediation: "Check the Nexkit output channel for details, then retry.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      };
      this._logger.error("Squad: preset discovery threw", squadError);
      this._postMessage({ command: "squadPresetsError", error: squadError });
    } finally {
      this._postMessage({ command: "squadPresetsLoading", isLoading: false });
    }
  }

  /**
   * Initialise Squad from the selected preset (SQD-020, FR-014). Delegates the
   * validate → confirm → backup → init → write → rollback flow to
   * {@link SquadInitService} and reports the outcome via `squadInitResult`. On
   * success it also re-emits `squadStatusUpdate` with the fresh detection so the
   * Squad tab flips from the "not installed" state to the detected view.
   */
  private async handleInitSquadFromPreset(presetId: string): Promise<void> {
    let result;
    try {
      result = await this._services.squadInit.initializeFromPreset(presetId);
    } catch (error) {
      const squadError: SquadError = {
        code: "unknown",
        message: "Initialising Squad from the preset failed unexpectedly.",
        remediation: "Check the Nexkit output channel for details, then try again.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      };
      this._logger.error("Squad: init from preset threw", squadError);
      this._postMessage({ command: "squadInitResult", presetId, ok: false, error: squadError });
      return;
    }

    if (isSquadErr(result)) {
      this._logger.warn("Squad: init from preset failed", result.error);
      this._postMessage({ command: "squadInitResult", presetId, ok: false, error: result.error });
      return;
    }

    this._postMessage({ command: "squadInitResult", presetId, ok: true });
    if (result.value.detection) {
      this._postMessage({
        command: "squadStatusUpdate",
        detection: result.value.detection,
        upstreams: [],
        // Upstreams are not re-read here; the next getSquadState evaluates them.
        upstreamRecommendations: null,
        marketplaces: [],
        plugins: [],
      });
    }
  }
}
