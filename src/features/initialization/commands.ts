import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { RepositoryConfigManager } from "../ai-resources/repositoryConfigManager";
import { InitWizard } from "./initWizard";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { MCPConfigDeployer } from "./mcpConfigDeployer";

/**
 * Register initialization-related commands
 */
export function registerInitializeWorkspaceCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  // Initialize Project command
  registerCommand(
    context,
    "nexus-nexkit-vscode.initWorkspace",
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

      // Run initialization wizard
      const wizard = new InitWizard();
      const wizardResult = await wizard.run();
      if (!wizardResult) {
        return; // User cancelled
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Initializing Nexkit workspace...",
          cancellable: false,
        },
        async (progress) => {
          progress.report({
            increment: 20,
            message: "Backing up existing templates...",
          });

          // Backup existing .github directory if it exists
          const githubPath = vscode.Uri.joinPath(workspaceFolder.uri, ".github").fsPath;
          const backupPath = await services.backup.backupDirectory(githubPath);
          if (backupPath) {
            console.log(`Backed up existing templates to: ${backupPath}`);
          }

          progress.report({
            increment: 40,
            message: "Deploying workspace configs...",
          });

          await services.gitIgnoreConfigDeployer.deployGitignore(workspaceFolder.uri.fsPath);
          await services.recommendedExtensionsConfigDeployer.deployVscodeExtensions(workspaceFolder.uri.fsPath);
          await services.recommendedSettingsConfigDeployer.deployVscodeSettings(workspaceFolder.uri.fsPath);

          if (wizardResult.enableAzureDevOpsMcpServer) {
            await services.mcpConfigDeployer.deployWorkspaceMCPServers(
              [MCPConfigDeployer.AzureDevopsServerName],
              workspaceFolder.uri.fsPath
            );
          }

          progress.report({
            increment: 20,
            message: "Deploying workspace templates...",
          });

          // Deploy default template files (agents, prompts, chatmodes) from the Nexus Templates
          const deploymentSummary = await services.templateFilesDeployer.deployTemplateFiles();

          console.log(
            `Deployed ${deploymentSummary.installed} resources:`,
            deploymentSummary.categories,
            deploymentSummary.failed > 0 ? `(${deploymentSummary.failed} failed)` : ""
          );

          progress.report({
            increment: 20,
            message: "Updating workspace settings...",
          });

          // Update workspace settings
          await SettingsManager.setWorkspaceInitialized(true);

          // Add Awesome Copilot repository to workspace if selected
          if (wizardResult.enableAwesomeCopilotRepoTemplates) {
            const awesomeCopilotRepo = RepositoryConfigManager.getAwesomeCopilotRepository();
            await SettingsManager.setRepositories([awesomeCopilotRepo]);
          }
        }
      );

      // Show success message with deployment summary
      const categorySummary = Object.entries(deploymentSummary.categories)
        .map(([cat, count]) => `${count} ${cat}`)
        .join(", ");
      const summaryMessage = deploymentSummary.installed > 0 ? ` Installed ${categorySummary}.` : "";
      vscode.window.showInformationMessage(`Nexkit project initialized successfully!${summaryMessage}`);
    },
    services.telemetry
  );

  // todo: remove this
  // Reinitialize Project command (delegates to init)
  registerCommand(
    context,
    "nexus-nexkit-vscode.reinitializeProject",
    async () => {
      await vscode.commands.executeCommand("nexus-nexkit-vscode.initProject");
    },
    services.telemetry
  );
}
