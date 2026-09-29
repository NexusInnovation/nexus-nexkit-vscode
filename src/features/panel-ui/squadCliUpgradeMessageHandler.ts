import * as vscode from "vscode";
import { LoggingService } from "../../shared/services/loggingService";
import { SquadCliUpgradeOutcome, SquadCliUpgradeSummary, SquadResult, isSquadErr } from "../squad/models";
import { SquadCliUpgradeOptions } from "../squad/services/squadCliUpgradeService";
import { ExtensionMessage, WebviewMessage } from "./types/webviewMessages";

/** Upgrade seam, structurally satisfied by `SquadCliUpgradeService`. */
export interface SquadCliUpgrader {
  upgradeCli(options?: SquadCliUpgradeOptions): Promise<SquadResult<SquadCliUpgradeOutcome>>;
}

/**
 * Routes the confirmed Squad CLI self-upgrade (SQD-031 / #246, PRD FR-005).
 *
 * Companion to {@link SquadPanelMessageHandler}: the confirmation dialog and
 * post-upgrade verification live in `SquadCliUpgradeService`; this handler only
 * wraps the call with a loading state and maps the outcome to the webview
 * contract. Failures (including a declined confirmation) always surface as
 * `squadError` — never as a success message.
 */
export class SquadCliUpgradeMessageHandler {
  constructor(
    private readonly _upgrader: SquadCliUpgrader,
    private readonly _postMessage: (message: ExtensionMessage) => void,
    private readonly _getWorkspaceRoot: () => vscode.Uri | undefined = () => vscode.workspace.workspaceFolders?.[0]?.uri,
    private readonly _logger?: LoggingService
  ) {}

  /** Returns `true` when the message was handled here. */
  public async handle(message: WebviewMessage): Promise<boolean> {
    if (message.command !== "upgradeSquadCli") {
      return false;
    }
    await this._handleUpgrade();
    return true;
  }

  private async _handleUpgrade(): Promise<void> {
    this._postMessage({ command: "squadLoading", isLoading: true });
    try {
      const result = await this._upgrader.upgradeCli({ workspaceRoot: this._getWorkspaceRoot() });
      if (isSquadErr(result)) {
        this._postMessage({ command: "squadError", error: result.error });
        return;
      }

      const { updates, ...summary } = result.value;
      this._postMessage({ command: "squadUpdatesUpdate", updates });
      this._postMessage({ command: "squadCliUpgradeResult", upgrade: summary satisfies SquadCliUpgradeSummary });
    } catch (error) {
      this._logger?.error("Unexpected failure while upgrading the Squad CLI", error);
      this._postMessage({
        command: "squadError",
        error: {
          code: "upgrade-failed",
          message: "NexKit could not complete the Squad CLI upgrade.",
          remediation: "Check the Nexkit output channel for details, then check for Squad updates again.",
          cause: error,
        },
      });
    } finally {
      this._postMessage({ command: "squadLoading", isLoading: false });
    }
  }
}
