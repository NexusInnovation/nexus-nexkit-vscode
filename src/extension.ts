// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { InitWizard } from "./initWizard";
import { ExtensionUpdateService } from "./services/extensionUpdateService";
import { TelemetryService } from "./services/telemetryService";
import { MCPConfigService } from "./services/mcpConfigService";
import { StatusBarService } from "./services/statusBarService";
import { MultiRepositoryAggregatorService } from "./services/multiRepositoryAggregatorService";
import { SettingsManager } from "./config/settingsManager";
import { RepositoryConfigManager } from "./config/repositoryConfigManager";
import { NexkitPanelViewProvider } from "./views/nexkitPanelViewProvider";
import { BackupService } from "./services/backupService";
import { GitIgnoreService } from "./services/gitIgnoreService";
import { VscodeWorkspaceService } from "./services/vscodeWorkspaceService";
import { WorkspaceAIResourceService } from "./services/workspaceAIResourceService";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log("Nexkit extension activated!");

  // Initialize settings manager
  SettingsManager.initialize(context);

  // Initialize telemetry service
  const telemetryService = new TelemetryService(context);
  await telemetryService.initialize();
  telemetryService.trackActivation();
  context.subscriptions.push(telemetryService);

  const mcpConfigService = new MCPConfigService();
  const repositoryAggregatorService = new MultiRepositoryAggregatorService();
  const workspaceAIResourceService = new WorkspaceAIResourceService();
  const statusBarService = new StatusBarService(context);
  const extensionUpdateService = new ExtensionUpdateService();
  const backupService = new BackupService();
  const gitIgnoreService = new GitIgnoreService();
  const vscodeWorkspaceService = new VscodeWorkspaceService(context);

  // Create and register the webview provider
  const nexkitPanelProvider = new NexkitPanelViewProvider(
    repositoryAggregatorService,
    workspaceAIResourceService,
    telemetryService
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("nexkitPanelView", nexkitPanelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Listen for workspace folder changes and update webview
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      nexkitPanelProvider.updateWorkspaceState(hasWorkspace);
    })
  );

  // Initialize status bar service
  await statusBarService.updateStatusBar();

  // Check for required MCP servers on activation
  mcpConfigService.checkRequiredMCPs();

  // Check for extension updates on activation
  extensionUpdateService.checkForExtensionUpdatesOnActivation();

  // Register commands
  const initProjectDisposable = vscode.commands.registerCommand("nexus-nexkit-vscode.initProject", async () => {
    await telemetryService.trackCommandExecution("initProject", async () => {
      try {
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

        // Show progress
        let deploymentSummary = { installed: 0, failed: 0, categories: {} as Record<string, number> };

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Initializing Nexkit project...",
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              increment: 10,
              message: "Backing up existing templates...",
            });

            // Backup existing .github directory if it exists
            const githubPath = vscode.Uri.joinPath(workspaceFolder.uri, ".github").fsPath;
            const backupPath = await backupService.backupDirectory(githubPath);
            if (backupPath) {
              console.log(`Backed up existing templates to: ${backupPath}`);
            }

            progress.report({
              increment: 30,
              message: "Preparing deployment configuration...",
            });

            const mcpServers = wizardResult.enableAzureDevOps ? ["azureDevOps"] : [];

            progress.report({
              increment: 40,
              message: "Deploying templates...",
            });

            await mcpConfigService.deployWorkspaceMCPServers(mcpServers, workspaceFolder.uri.fsPath);
            await gitIgnoreService.createGitignore(workspaceFolder.uri.fsPath);

            if (wizardResult.createVscodeSettings) {
              await vscodeWorkspaceService.deployVscodeSettings(workspaceFolder.uri.fsPath);
            }
            if (wizardResult.createVscodeExtensions) {
              await vscodeWorkspaceService.deployVscodeExtensions(workspaceFolder.uri.fsPath);
            }

            // Deploy default resources (agents, prompts, chatmodes) from Nexus Templates
            deploymentSummary = await workspaceAIResourceService.deployDefaultResources();

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
            await SettingsManager.setWorkspaceMcpServers(mcpServers);

            // Add Awesome Copilot repository to workspace if selected
            if (wizardResult.enableAwesomeCopilot) {
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
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to initialize project: ${error}`);
        throw error;
      }
    });
  });

  const installUserMCPsDisposable = vscode.commands.registerCommand("nexus-nexkit-vscode.installUserMCPs", async () => {
    await telemetryService.trackCommandExecution("installUserMCPs", async () => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Installing user MCP servers...",
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              increment: 25,
              message: "Checking existing configuration...",
            });

            // Check what's already configured
            const { configured, missing } = await mcpConfigService.checkRequiredUserMCPs();

            if (missing.length === 0) {
              vscode.window.showInformationMessage("All required MCP servers are already configured!");
              return;
            }

            progress.report({
              increment: 50,
              message: `Installing ${missing.join(", ")}...`,
            });

            // Install missing servers
            for (const server of missing) {
              if (server === "context7") {
                await mcpConfigService.addUserMCPServer("context7", {
                  command: "npx",
                  args: ["-y", "@upstash/context7-mcp"],
                });
              } else if (server === "sequential-thinking") {
                await mcpConfigService.addUserMCPServer("sequential-thinking", {
                  command: "npx",
                  args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
                });
              }
            }

            progress.report({
              increment: 25,
              message: "Installation complete",
            });
          }
        );

        vscode.window
          .showInformationMessage(
            "User MCP servers installed successfully! Please reload VS Code for changes to take effect.",
            "Reload Now"
          )
          .then((selection) => {
            if (selection === "Reload Now") {
              vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
          });
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to install MCP servers: ${error}`);
        throw error;
      }
    });
  });

  const configureAzureDevOpsDisposable = vscode.commands.registerCommand("nexus-nexkit-vscode.configureAzureDevOps", () => {
    telemetryService.trackCommand("configureAzureDevOps");
    vscode.window.showInformationMessage("Configure Azure DevOps functionality coming soon...");
  });

  const openSettingsDisposable = vscode.commands.registerCommand("nexus-nexkit-vscode.openSettings", async () => {
    await telemetryService.trackCommandExecution("openSettings", async () => {
      try {
        // Open VS Code settings with nexkit filter
        await vscode.commands.executeCommand("workbench.action.openSettings", "nexkit");
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open settings: ${error}`);
        throw error;
      }
    });
  });

  const restoreBackupDisposable = vscode.commands.registerCommand("nexus-nexkit-vscode.restoreBackup", async () => {
    await telemetryService.trackCommandExecution("restoreBackup", async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder open");
          return;
        }

        const backups = await backupService.listBackups(workspaceFolder.uri.fsPath, ".github");

        if (backups.length === 0) {
          vscode.window.showInformationMessage("No backups available");
          return;
        }

        // Show backup selection
        const selectedBackup = await vscode.window.showQuickPick(
          backups.map((backup) => ({
            label: backup.replace(".github.backup-", ""),
            description: backup,
            detail: `Restore from ${backup}`,
          })),
          {
            placeHolder: "Select a backup to restore",
            title: "Nexkit: Restore Template Backup",
          }
        );

        if (!selectedBackup) {
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `This will replace your current .github directory with the backup from ${selectedBackup.label}. Continue?`,
          { modal: true },
          "Restore"
        );

        if (confirm !== "Restore") {
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Restoring backup...",
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              increment: 50,
              message: "Restoring templates...",
            });
            await backupService.restoreBackup(workspaceFolder.uri.fsPath, ".github", selectedBackup.description);

            progress.report({
              increment: 50,
              message: "Backup restored successfully",
            });
          }
        );

        vscode.window.showInformationMessage("Template backup restored successfully!");
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to restore backup: ${error}`);
        throw error;
      }
    });
  });

  const reinitializeProjectDisposable = vscode.commands.registerCommand("nexus-nexkit-vscode.reinitializeProject", async () => {
    await telemetryService.trackCommandExecution("reinitializeProject", async () => {
      try {
        // Run the init project command (it already handles re-initialization)
        await vscode.commands.executeCommand("nexus-nexkit-vscode.initProject");
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to re-initialize project: ${error}`);
        throw error;
      }
    });
  });

  const checkExtensionUpdateDisposable = vscode.commands.registerCommand("nexus-nexkit-vscode.checkExtensionUpdate", async () => {
    await telemetryService.trackCommandExecution("checkExtensionUpdate", async () => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Checking for extension updates...",
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              increment: 30,
              message: "Checking GitHub releases...",
            });

            const updateInfo = await extensionUpdateService.checkForExtensionUpdate();

            if (!updateInfo) {
              vscode.window.showInformationMessage("Nexkit extension is up to date!");
              return;
            }

            progress.report({
              increment: 70,
              message: "Update available...",
            });

            // Prompt user for update action
            await extensionUpdateService.promptUserForUpdate(updateInfo);
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to check for extension updates: ${error}`);
        throw error;
      }
    });
  });

  context.subscriptions.push(
    initProjectDisposable,
    installUserMCPsDisposable,
    configureAzureDevOpsDisposable,
    openSettingsDisposable,
    restoreBackupDisposable,
    reinitializeProjectDisposable,
    checkExtensionUpdateDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
