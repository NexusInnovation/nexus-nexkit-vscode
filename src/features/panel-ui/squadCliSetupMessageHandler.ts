import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { LoggingService } from "../../shared/services/loggingService";
import { SquadCliSource } from "../squad/models";
import { SQUAD_CLI_NPX_PACKAGE } from "../squad/services/squadCliService";
import { ExtensionMessage, WebviewMessage } from "./types/webviewMessages";

/**
 * npm command used to install the Squad CLI globally (FR-004). Kept as a named
 * constant so the terminal command and any user-facing prompt stay in sync.
 */
export const SQUAD_CLI_INSTALL_COMMAND = `npm install -g ${SQUAD_CLI_NPX_PACKAGE}@latest`;

/** Label of the terminal opened for a global Squad CLI install. */
export const SQUAD_CLI_INSTALL_TERMINAL_NAME = "Squad CLI install";

/**
 * Handles the Squad CLI-missing setup flow (SQD-025 / #240, PRD FR-004).
 *
 * Small, self-contained companion to {@link SquadPanelMessageHandler}: it owns
 * only the two additive setup commands and is delegated to from the panel
 * message handler after the main Squad handler declines a message.
 *
 * - `setSquadCliInvocation`: persists the chosen invocation strategy
 *   (global / npx / custom path) through {@link SettingsManager} at the Global
 *   target (per SQD-002), then re-runs detection so the panel reflects the new
 *   configuration.
 * - `installSquadCli`: after an explicit confirmation dialog, opens a VS Code
 *   terminal and runs the global npm install command — never silently — sets
 *   the invocation to `global`, and re-runs detection.
 *
 * Failures always surface as a structured, actionable {@link SquadError} via
 * `squadError`; the flow never reports a silent success.
 */
export class SquadCliSetupMessageHandler {
  constructor(
    private readonly _postMessage: (message: ExtensionMessage) => void,
    private readonly _redetect: () => Promise<void>,
    private readonly _logger?: LoggingService
  ) {}

  /**
   * Route a Squad CLI setup message. Returns `true` when the command was one of
   * this handler's setup commands, `false` otherwise so the caller can continue.
   */
  public async handle(message: WebviewMessage): Promise<boolean> {
    switch (message.command) {
      case "setSquadCliInvocation":
        await this.handleSetInvocation(message.source, message.cliPath);
        return true;
      case "installSquadCli":
        await this.handleInstall();
        return true;
      default:
        return false;
    }
  }

  private async handleSetInvocation(source: SquadCliSource, cliPath?: string): Promise<void> {
    try {
      if (source === SquadCliSource.Custom) {
        const trimmed = (cliPath ?? "").trim();
        if (trimmed === "") {
          this._postMessage({
            command: "squadError",
            error: {
              code: "cli-not-found",
              message: "A custom Squad CLI path is required.",
              remediation: "Enter the full path to your Squad CLI executable, then apply the choice again.",
            },
          });
          return;
        }
        await SettingsManager.setSquadCliPath(trimmed);
      }

      await SettingsManager.setSquadCliSource(source);
      this._logger?.info(`Squad CLI invocation set to '${source}'.`);
      await this._redetect();
    } catch (error) {
      this._logger?.error("Failed to set Squad CLI invocation", error);
      this._postMessage({
        command: "squadError",
        error: {
          code: "unknown",
          message: "NexKit could not save the Squad CLI invocation choice.",
          remediation: "Check your VS Code settings permissions and try again.",
          cause: error,
        },
      });
    }
  }

  private async handleInstall(): Promise<void> {
    const confirm = "Install with npm";
    const choice = await vscode.window.showWarningMessage(
      `NexKit will run "${SQUAD_CLI_INSTALL_COMMAND}" in a new terminal to install the Squad CLI globally. Continue?`,
      { modal: true },
      confirm
    );
    if (choice !== confirm) {
      return;
    }

    try {
      const terminal = vscode.window.createTerminal(SQUAD_CLI_INSTALL_TERMINAL_NAME);
      terminal.show();
      terminal.sendText(SQUAD_CLI_INSTALL_COMMAND);

      // The user opted to install globally, so make that the active invocation.
      await SettingsManager.setSquadCliSource(SquadCliSource.Global);
      this._logger?.info("Squad CLI global install started in a terminal.");
      await this._redetect();
    } catch (error) {
      this._logger?.error("Failed to start Squad CLI install", error);
      this._postMessage({
        command: "squadError",
        error: {
          code: "unknown",
          message: "NexKit could not start the Squad CLI installation.",
          remediation: `Run \`${SQUAD_CLI_INSTALL_COMMAND}\` manually in a terminal, then refresh Squad detection.`,
          cause: error,
        },
      });
    }
  }
}
