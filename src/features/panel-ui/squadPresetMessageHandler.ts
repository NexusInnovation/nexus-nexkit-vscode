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
 * The actual "initialise from preset" flow ships in #235 (Link). This handler
 * accepts the additive `initSquadFromPreset` request and replies with a clear
 * "not available yet" result so the panel can surface it, leaving the real
 * initialisation to the CLI-backed service still in flight.
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
        this.handleInitSquadFromPreset(message.presetId);
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
   * Preset-driven initialisation is CLI-backed and ships in #235. Reply with a
   * clear "not available yet" result rather than faking success.
   */
  private handleInitSquadFromPreset(presetId: string): void {
    this._postMessage({
      command: "squadInitResult",
      presetId,
      ok: false,
      error: {
        code: "preset-fetch-failed",
        message: "Initialising Squad from a preset is not available yet.",
        remediation:
          "Preset initialisation will be enabled once the Squad CLI integration ships. For now, run `squad init` from a terminal.",
      },
    });
  }
}
