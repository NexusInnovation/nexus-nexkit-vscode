import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { MCPConfigDeployer } from "./mcpConfigDeployer";
import { Commands } from "../../shared/constants/commands";

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

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Initializing Nexkit workspace...",
          cancellable: false,
        },
        async () => {
          const { deploymentSummary, backupPath } = await services.workspaceInitialization.initializeWorkspace(
            workspaceFolder,
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
        }
      );
    },
    services.telemetry
  );
}
