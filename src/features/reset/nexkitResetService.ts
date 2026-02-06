import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Service for resetting Nexkit to its initial installation state
 * Useful for testing and troubleshooting
 */
export class NexkitResetService {
  /**
   * Reset Nexkit to initial state by clearing all state and settings
   */
  public async resetToInitialState(context: vscode.ExtensionContext): Promise<void> {
    try {
      // Clear all workspace state
      const workspaceStateKeys = context.workspaceState.keys();
      for (const key of workspaceStateKeys) {
        await context.workspaceState.update(key, undefined);
      }

      // Clear all global state
      const globalStateKeys = context.globalState.keys();
      for (const key of globalStateKeys) {
        await context.globalState.update(key, undefined);
      }

      // Reset user mode setting to notset
      await SettingsManager.setUserMode("notset");

      // Reset first time user flag to true
      await SettingsManager.setFirstTimeUser(true);

      // Reset workspace initialization flags
      await SettingsManager.setWorkspaceInitialized(false);
      await SettingsManager.setWorkspaceInitPromptDismissed(false);

      // Reset MCP setup dismissal
      await SettingsManager.setMcpSetupDismissed(false);

      console.log("Nexkit reset to initial state successfully");
    } catch (error) {
      console.error("Error resetting Nexkit:", error);
      throw error;
    }
  }

  /**
   * Prompt user for confirmation before reset
   * @returns true if user confirmed, false otherwise
   */
  public async confirmReset(): Promise<boolean> {
    const result = await vscode.window.showWarningMessage(
      "This will reset Nexkit to its initial installation state. All workspace-specific settings and state will be cleared. This action cannot be undone. Continue?",
      { modal: true },
      "Yes, Reset",
      "Cancel"
    );

    return result === "Yes, Reset";
  }
}
