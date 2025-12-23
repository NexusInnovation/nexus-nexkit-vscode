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
          // Backup existing .github directory if it exists
          const githubPath = vscode.Uri.joinPath(workspaceFolder.uri, ".github").fsPath;
          const backupPath = await services.backup.backupDirectory(githubPath);

          // Deploy configuration files
          await services.gitIgnoreConfigDeployer.deployGitignore(workspaceFolder.uri.fsPath);
          await services.recommendedExtensionsConfigDeployer.deployVscodeExtensions(workspaceFolder.uri.fsPath);
          await services.recommendedSettingsConfigDeployer.deployVscodeSettings(workspaceFolder.uri.fsPath);
          await services.mcpConfigDeployer.deployWorkspaceMCPServers(workspaceFolder.uri.fsPath);

          // Deploy default template files (agents, prompts, chatmodes) from the Nexus Templates
          const deploymentSummary = await services.aiTemplateFilesDeployer.deployTemplateFiles();

          // Update workspace settings
          await SettingsManager.setWorkspaceInitialized(true);

          // Show success message with deployment summary
          let resultMessage = "Nexkit project initialized successfully!";

          if (deploymentSummary != null && deploymentSummary.installed > 0) {
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
