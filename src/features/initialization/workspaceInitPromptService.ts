import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { Commands } from "../../shared/constants/commands";

/**
 * Service for prompting users to initialize their workspace
 * Handles detecting uninitialized workspaces and showing appropriate notifications
 */
export class WorkspaceInitPromptService {
  /**
   * Check if workspace is initialized and prompt user if not
   * Called when workspace folders change or on activation
   */
  public async promptInitWorkspaceOnWorkspaceChange(): Promise<void> {
    try {
      // Check if a workspace folder exists
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        // No workspace open, nothing to do
        return;
      }

      // Check if workspace is already initialized
      const isInitialized = SettingsManager.isWorkspaceInitialized();
      if (isInitialized) {
        // Workspace already initialized, no need to prompt
        return;
      }

      // Check if user has dismissed this notification for this workspace
      if (SettingsManager.isWorkspaceInitPromptDismissed()) {
        // User doesn't want to be asked again for this workspace
        return;
      }

      // Show notification with options
      const result = await vscode.window.showInformationMessage(
        "This workspace is not initialized with Nexkit. Would you like to initialize it now?",
        "Initialize",
        "Later",
        "Don't Ask Again"
      );

      if (result === "Initialize") {
        // Execute the initialization command
        await vscode.commands.executeCommand(Commands.INIT_WORKSPACE);
      } else if (result === "Don't Ask Again") {
        // Store dismissal state for this workspace
        await SettingsManager.setWorkspaceInitPromptDismissed(true);
      }
      // If "Later" is selected or dialog is dismissed, do nothing
    } catch (error) {
      console.error("Error prompting workspace initialization:", error);
    }
  }
}
