import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { ProfileSelectionPromptService } from "./profileSelectionPromptService";

/**
 * Register initialization-related commands
 */
export function registerInitializeWorkspaceCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  // Initialize Project command
  registerCommand(
    context,
    Commands.INIT_WORKSPACE,
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open. Please open a workspace first.");
        return;
      }

      // Check if already initialized
      const isInitialized = SettingsManager.isWorkspaceInitialized();
      if (isInitialized) {
        const result = await vscode.window.showWarningMessage(
          "Workspace already initialized with Nexkit. This will run the initialization wizard again and reconfigure your Nexkit settings. Continue?",
          "Yes",
          "No"
        );
        if (result !== "Yes") {
          return;
        }
      }

      // Prompt user to select a profile if any are saved
      const selectedProfileName = await new ProfileSelectionPromptService(services.profileService).promptProfileSelection();

      const { deploymentSummary, backupPath } = await services.workspaceInitialization.initializeWorkspace(
        workspaceFolder,
        selectedProfileName,
        services
      );

      // Show success message with deployment summary
      let resultMessage = "Nexkit project initialized successfully!";

      if (deploymentSummary !== null && deploymentSummary.installed > 0) {
        resultMessage += ` Installed ${deploymentSummary.installed} templates.`;
      }

      if (backupPath) {
        resultMessage += ` Backed up existing templates to: ${backupPath}.`;
      }

      vscode.window.showInformationMessage(`${resultMessage}`);
    },
    services.telemetry
  );
}
