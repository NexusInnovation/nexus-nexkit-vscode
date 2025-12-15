// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { TemplateManager, DeploymentConfig } from "./templateManager";
import { InitWizard } from "./initWizard";
import { MCPConfigManager } from "./mcpConfigManager";
import { NexkitPanel } from "./nexkitPanel";
import { ExtensionUpdateManager } from "./extensionUpdateManager";
import { TelemetryService } from "./telemetryService";
import { AwesomeCopilotService } from "./awesomeCopilotService";
import { ContentManager } from "./contentManager";

/**
 * Check for required MCP servers and show notification if missing
 */
async function checkRequiredMCPs(
  mcpConfigManager: MCPConfigManager
): Promise<void> {
  try {
    const { missing } = await mcpConfigManager.checkRequiredUserMCPs();

    if (missing.length > 0) {
      // Check if user has dismissed this notification before
      const config = vscode.workspace.getConfiguration("nexkit");
      const dismissed = config.get("mcpSetup.dismissed", false);

      if (!dismissed) {
        const result = await vscode.window.showInformationMessage(
          `Nexkit requires MCP servers: ${missing.join(", ")}. Install now?`,
          "Install",
          "Later",
          "Don't Ask Again"
        );

        if (result === "Install") {
          vscode.commands.executeCommand("nexkit-vscode.installUserMCPs");
        } else if (result === "Don't Ask Again") {
          await config.update(
            "mcpSetup.dismissed",
            true,
            vscode.ConfigurationTarget.Global
          );
        }
      }
    }
  } catch (error) {
    console.error("Error checking MCP servers:", error);
  }
}

/**
 * Update the status bar with extension version and update status
 */
async function updateStatusBar(
  statusBarItem: vscode.StatusBarItem,
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const extensionVersion =
      vscode.extensions.getExtension("nexusinno.nexkit-vscode")?.packageJSON
        .version || "0.0.0";
    const extensionUpdateManager = new ExtensionUpdateManager(context);
    const extensionUpdateInfo =
      await extensionUpdateManager.checkForExtensionUpdate();

    if (extensionUpdateInfo) {
      statusBarItem.text = `$(cloud-download) Nexkit v${extensionVersion}`;
      statusBarItem.tooltip = `Extension update available: ${extensionUpdateInfo.latestVersion}. Click to update.`;
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
      statusBarItem.command = "nexkit-vscode.checkExtensionUpdate";
    } else {
      statusBarItem.text = `$(check) Nexkit v${extensionVersion}`;
      statusBarItem.tooltip = `Nexkit v${extensionVersion} is up to date. Click to check for updates.`;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.command = "nexkit-vscode.checkExtensionUpdate";
    }

    statusBarItem.show();
  } catch (error) {
    console.error("Error updating status bar:", error);
    statusBarItem.text = `$(warning) Nexkit`;
    statusBarItem.tooltip = "Error checking update status";
    statusBarItem.command = "nexkit-vscode.checkExtensionUpdate";
    statusBarItem.show();
  }
}

/**
 * Check for extension updates on activation
 */
async function checkForExtensionUpdates(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const extensionUpdateManager = new ExtensionUpdateManager(context);

    if (extensionUpdateManager.shouldCheckForExtensionUpdates()) {
      // Pass silent=true to avoid prompts during automatic checks
      const updateInfo = await extensionUpdateManager.checkForExtensionUpdate();

      if (updateInfo) {
        const result = await vscode.window.showInformationMessage(
          `Nexkit extension ${updateInfo.latestVersion} available!`,
          "Update Now",
          "Remind Later"
        );

        if (result === "Update Now") {
          await extensionUpdateManager.promptUserForUpdate(updateInfo);
        }
      }

      // (Timestamp update handled by ExtensionUpdateManager)
    }
  } catch (error) {
    // Only log errors that aren't "no releases" errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes("No releases")) {
      console.error("Error checking for extension updates:", error);
    } else {
      console.log("[Nexkit] No releases available yet");
    }
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log("Nexkit extension activated!");

  // Initialize telemetry service
  const telemetryService = new TelemetryService(context);
  await telemetryService.initialize();
  telemetryService.trackActivation();
  context.subscriptions.push(telemetryService);

  const templateManager = new TemplateManager(context);
  const mcpConfigManager = new MCPConfigManager();
  const awesomeCopilotService = new AwesomeCopilotService(context);
  const contentManager = new ContentManager(context);

  // Register NexkitPanel WebviewViewProvider for sidebar
  class NexkitPanelViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(
      private readonly _extensionUri: vscode.Uri,
      private readonly _awesomeCopilotService: AwesomeCopilotService,
      private readonly _contentManager: ContentManager
    ) {}

    async resolveWebviewView(
      webviewView: vscode.WebviewView,
      context: vscode.WebviewViewResolveContext<unknown>,
      token: vscode.CancellationToken
    ): Promise<void> {
      this._view = webviewView;

      webviewView.webview.options = {
        enableScripts: true,
      };
      // Use static helper to get HTML
      webviewView.webview.html = NexkitPanel.getWebviewContent(
        webviewView.webview,
        this._extensionUri
      );

      // Set up message listener
      webviewView.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
          case "ready":
            // Webview is ready - send initial version, status, workspace and initialization state
            const ext = vscode.extensions.getExtension(
              "nexusinno.nexkit-vscode"
            );
            const version = ext?.packageJSON.version || "Unknown";
            const hasWorkspace =
              (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
            const isInitialized = vscode.workspace
              .getConfiguration("nexkit")
              .get("workspace.initialized", false);
            webviewView.webview.postMessage({
              version,
              status: "Ready",
              hasWorkspace,
              isInitialized,
            });
            break;

          case "initProject":
            telemetryService.trackEvent("ui.button.clicked", {
              buttonName: "initProject",
              source: "webview",
            });
            await vscode.commands.executeCommand("nexkit-vscode.initProject");
            const ext3 = vscode.extensions.getExtension(
              "nexusinno.nexkit-vscode"
            );
            webviewView.webview.postMessage({
              version: ext3?.packageJSON.version || "Unknown",
              status: "Project initialized",
              isInitialized: vscode.workspace
                .getConfiguration("nexkit")
                .get("workspace.initialized", false),
            });
            break;
          case "updateTemplates":
            telemetryService.trackEvent("ui.button.clicked", {
              buttonName: "updateTemplates",
              source: "webview",
            });
            await vscode.commands.executeCommand(
              "nexkit-vscode.updateTemplates"
            );
            const ext6 = vscode.extensions.getExtension(
              "nexusinno.nexkit-vscode"
            );
            webviewView.webview.postMessage({
              version: ext6?.packageJSON.version || "Unknown",
              status: "Templates updated",
              isInitialized: vscode.workspace
                .getConfiguration("nexkit")
                .get("workspace.initialized", false),
            });
            break;
          case "reinitializeProject":
            telemetryService.trackEvent("ui.button.clicked", {
              buttonName: "reinitializeProject",
              source: "webview",
            });
            await vscode.commands.executeCommand(
              "nexkit-vscode.reinitializeProject"
            );
            const ext7 = vscode.extensions.getExtension(
              "nexusinno.nexkit-vscode"
            );
            webviewView.webview.postMessage({
              version: ext7?.packageJSON.version || "Unknown",
              status: "Project re-initialized",
              isInitialized: vscode.workspace
                .getConfiguration("nexkit")
                .get("workspace.initialized", false),
            });
            break;
          case "installUserMCPs":
            telemetryService.trackEvent("ui.button.clicked", {
              buttonName: "installUserMCPs",
              source: "webview",
            });
            await vscode.commands.executeCommand(
              "nexkit-vscode.installUserMCPs"
            );
            const ext4 = vscode.extensions.getExtension(
              "nexusinno.nexkit-vscode"
            );
            webviewView.webview.postMessage({
              version: ext4?.packageJSON.version || "Unknown",
              status: "User MCP servers installed",
            });
            break;
          case "openSettings":
            telemetryService.trackEvent("ui.button.clicked", {
              buttonName: "openSettings",
              source: "webview",
            });
            await vscode.commands.executeCommand("nexkit-vscode.openSettings");
            const ext5 = vscode.extensions.getExtension(
              "nexusinno.nexkit-vscode"
            );
            webviewView.webview.postMessage({
              version: ext5?.packageJSON.version || "Unknown",
              status: "Settings opened",
            });
            break;

          case "loadAwesomeItems":
            try {
              console.log("[Nexkit] Loading awesome items from GitHub...");
              // Fetch items from GitHub
              const agents = await this._awesomeCopilotService.fetchAgents();
              console.log(`[Nexkit] Fetched ${agents.length} agents`);
              const prompts = await this._awesomeCopilotService.fetchPrompts();
              console.log(`[Nexkit] Fetched ${prompts.length} prompts`);
              const instructions =
                await this._awesomeCopilotService.fetchInstructions();
              console.log(
                `[Nexkit] Fetched ${instructions.length} instructions`
              );

              // Get installed items
              const installed = await this._contentManager.getInstalledItems();
              console.log(
                `[Nexkit] Found ${installed.agents.size} installed agents, ${installed.prompts.size} prompts, ${installed.instructions.size} instructions`
              );

              // Send to webview
              webviewView.webview.postMessage({
                command: "awesomeItemsLoaded",
                items: { agents, prompts, instructions },
                installed: {
                  agents: Array.from(installed.agents),
                  prompts: Array.from(installed.prompts),
                  instructions: Array.from(installed.instructions),
                },
              });
            } catch (error) {
              console.error("[Nexkit] Error loading awesome items:", error);
              webviewView.webview.postMessage({
                command: "awesomeItemsError",
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;

          case "installItem":
            try {
              const { category, item } = message;
              // Download file content
              const content = await this._awesomeCopilotService.downloadFile(
                item.rawUrl
              );
              // Install file
              await this._contentManager.installFile(
                category,
                item.name,
                content
              );
              // Notify webview
              webviewView.webview.postMessage({
                command: "itemInstalled",
                category,
                itemName: item.name,
              });
            } catch (error) {
              console.error("Error installing item:", error);
              vscode.window.showErrorMessage(
                `Failed to install item: ${error}`
              );
            }
            break;

          case "removeItem":
            try {
              const { category, item } = message;
              // Remove file
              await this._contentManager.removeFile(category, item.name);
              // Notify webview
              webviewView.webview.postMessage({
                command: "itemRemoved",
                category,
                itemName: item.name,
              });
            } catch (error) {
              console.error("Error removing item:", error);
            }
            break;
        }
      });
    }

    public updateWorkspaceState(hasWorkspace: boolean) {
      if (this._view) {
        this._view.webview.postMessage({ hasWorkspace });
      }
    }
  }

  // Create and register the webview provider
  const nexkitPanelProvider = new NexkitPanelViewProvider(
    context.extensionUri,
    awesomeCopilotService,
    contentManager
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "nexkitPanelView",
      nexkitPanelProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );

  // Listen for workspace folder changes and update webview
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      nexkitPanelProvider.updateWorkspaceState(hasWorkspace);
    })
  );

  // Create status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "nexkit-vscode.checkExtensionUpdate";
  context.subscriptions.push(statusBarItem);

  // Update status bar
  updateStatusBar(statusBarItem, context);

  // Check for required MCP servers on activation
  checkRequiredMCPs(mcpConfigManager);

  // Check for extension updates on activation
  checkForExtensionUpdates(context);

  // Register commands
  const initProjectDisposable = vscode.commands.registerCommand(
    "nexkit-vscode.initProject",
    async () => {
      await telemetryService.trackCommandExecution("initProject", async () => {
        try {
          // Check if already initialized
          const isInitialized = vscode.workspace
            .getConfiguration("nexkit")
            .get("workspace.initialized", false);
          if (isInitialized) {
            const result = await vscode.window.showWarningMessage(
              "Workspace already initialized with Nexkit. Re-initialize?",
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
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
              if (workspaceFolder) {
                const githubPath = vscode.Uri.joinPath(
                  workspaceFolder.uri,
                  ".github"
                ).fsPath;
                const backupPath = await templateManager.backupDirectory(
                  githubPath
                );
                if (backupPath) {
                  console.log(`Backed up existing templates to: ${backupPath}`);
                }
              }

              progress.report({
                increment: 30,
                message: "Preparing deployment configuration...",
              });

              // Dynamically discover files to always deploy
              const alwaysDeployFiles =
                await templateManager.discoverAlwaysDeployFiles();

              // Create deployment config based on wizard results
              const deploymentConfig: DeploymentConfig = {
                alwaysDeploy: alwaysDeployFiles,
                conditionalDeploy: {
                  "instructions.python": wizardResult.languages.includes(
                    "python"
                  )
                    ? [".github/instructions/python.instructions.md"]
                    : [],
                  "instructions.typescript": wizardResult.languages.includes(
                    "typescript"
                  )
                    ? [
                        ".github/instructions/typescript-5-es2022.instructions.md",
                      ]
                    : [],
                  "instructions.csharp": wizardResult.languages.includes("c#")
                    ? [".github/instructions/csharp.instructions.md"]
                    : [],
                  "instructions.reactjs": wizardResult.languages.includes(
                    "react"
                  )
                    ? [".github/instructions/reactjs.instructions.md"]
                    : [],
                  "instructions.bicep": wizardResult.languages.includes("bicep")
                    ? [
                        ".github/instructions/bicep-code-best-practices.instructions.md",
                      ]
                    : [],
                  "instructions.dotnetFramework":
                    wizardResult.languages.includes("netframework")
                      ? [
                          ".github/instructions/dotnet-framework.instructions.md",
                        ]
                      : [],
                  "instructions.markdown": wizardResult.languages.includes(
                    "markdown"
                  )
                    ? [".github/instructions/markdown.instructions.md"]
                    : [],
                  "instructions.azureDevOpsPipelines":
                    wizardResult.languages.includes("azuredevopspipelines")
                      ? [
                          ".github/instructions/azure-devops-pipelines.instructions.md",
                        ]
                      : [],
                },
                workspaceMCPs: wizardResult.enableAzureDevOps
                  ? ["azureDevOps"]
                  : [],
              };

              progress.report({
                increment: 40,
                message: "Deploying templates...",
              });

              // Deploy templates
              await templateManager.deployTemplates(deploymentConfig);

              progress.report({
                increment: 20,
                message: "Updating workspace settings...",
              });

              // Update workspace settings
              const config = vscode.workspace.getConfiguration("nexkit");
              await config.update(
                "workspace.initialized",
                true,
                vscode.ConfigurationTarget.Workspace
              );
              await config.update(
                "workspace.languages",
                wizardResult.languages,
                vscode.ConfigurationTarget.Workspace
              );
              await config.update(
                "workspace.mcpServers",
                deploymentConfig.workspaceMCPs,
                vscode.ConfigurationTarget.Workspace
              );

              // Update init settings based on wizard
              await config.update(
                "init.createVscodeSettings",
                wizardResult.createVscodeSettings,
                vscode.ConfigurationTarget.Workspace
              );
              await config.update(
                "init.createGitignore",
                wizardResult.createGitignore,
                vscode.ConfigurationTarget.Workspace
              );
            }
          );

          vscode.window.showInformationMessage(
            "Nexkit project initialized successfully!"
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to initialize project: ${error}`
          );
          throw error;
        }
      });
    }
  );

  const installUserMCPsDisposable = vscode.commands.registerCommand(
    "nexkit-vscode.installUserMCPs",
    async () => {
      await telemetryService.trackCommandExecution(
        "installUserMCPs",
        async () => {
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
                const { configured, missing } =
                  await mcpConfigManager.checkRequiredUserMCPs();

                if (missing.length === 0) {
                  vscode.window.showInformationMessage(
                    "All required MCP servers are already configured!"
                  );
                  return;
                }

                progress.report({
                  increment: 50,
                  message: `Installing ${missing.join(", ")}...`,
                });

                // Install missing servers
                for (const server of missing) {
                  if (server === "context7") {
                    await mcpConfigManager.addUserMCPServer("context7", {
                      command: "npx",
                      args: ["-y", "@upstash/context7-mcp"],
                    });
                  } else if (server === "sequential-thinking") {
                    await mcpConfigManager.addUserMCPServer(
                      "sequential-thinking",
                      {
                        command: "npx",
                        args: [
                          "-y",
                          "@modelcontextprotocol/server-sequential-thinking",
                        ],
                      }
                    );
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
                  vscode.commands.executeCommand(
                    "workbench.action.reloadWindow"
                  );
                }
              });
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to install MCP servers: ${error}`
            );
            throw error;
          }
        }
      );
    }
  );

  const configureAzureDevOpsDisposable = vscode.commands.registerCommand(
    "nexkit-vscode.configureAzureDevOps",
    () => {
      telemetryService.trackCommand("configureAzureDevOps");
      vscode.window.showInformationMessage(
        "Configure Azure DevOps functionality coming soon..."
      );
    }
  );

  const openSettingsDisposable = vscode.commands.registerCommand(
    "nexkit-vscode.openSettings",
    async () => {
      await telemetryService.trackCommandExecution("openSettings", async () => {
        try {
          // Open VS Code settings with nexkit filter
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "nexkit"
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to open settings: ${error}`);
          throw error;
        }
      });
    }
  );

  const restoreBackupDisposable = vscode.commands.registerCommand(
    "nexkit-vscode.restoreBackup",
    async () => {
      await telemetryService.trackCommandExecution(
        "restoreBackup",
        async () => {
          try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
              vscode.window.showErrorMessage("No workspace folder open");
              return;
            }

            const backups = await templateManager.listBackups(
              workspaceFolder.uri.fsPath
            );

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
              "Restore",
              "Cancel"
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
                await templateManager.restoreBackup(
                  workspaceFolder.uri.fsPath,
                  selectedBackup.description
                );

                progress.report({
                  increment: 50,
                  message: "Backup restored successfully",
                });
              }
            );

            vscode.window.showInformationMessage(
              "Template backup restored successfully!"
            );
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to restore backup: ${error}`
            );
            throw error;
          }
        }
      );
    }
  );

  const updateTemplatesDisposable = vscode.commands.registerCommand(
    "nexkit-vscode.updateTemplates",
    async () => {
      await telemetryService.trackCommandExecution(
        "updateTemplates",
        async () => {
          try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
              vscode.window.showErrorMessage(
                "No workspace folder open. Please open a workspace first."
              );
              return;
            }

            // Get stored configuration
            const config = vscode.workspace.getConfiguration("nexkit");
            const languages = config.get("workspace.languages", []) as string[];
            const mcpServers = config.get(
              "workspace.mcpServers",
              []
            ) as string[];

            if (languages.length === 0) {
              const result = await vscode.window.showWarningMessage(
                "Workspace not initialized with Nexkit. Run Initialize Project instead?",
                "Initialize",
                "Cancel"
              );
              if (result === "Initialize") {
                await vscode.commands.executeCommand(
                  "nexkit-vscode.initProject"
                );
              }
              return;
            }

            const confirm = await vscode.window.showInformationMessage(
              "This will update your Nexkit templates from the extension bundle. Any custom changes to templates will be overwritten. Continue?",
              "Update",
              "Cancel"
            );

            if (confirm !== "Update") {
              return;
            }

            await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "Updating Nexkit templates...",
                cancellable: false,
              },
              async (progress) => {
                progress.report({
                  increment: 10,
                  message: "Backing up existing templates...",
                });

                // Backup existing .github directory
                const githubPath = vscode.Uri.joinPath(
                  workspaceFolder.uri,
                  ".github"
                ).fsPath;
                const backupPath = await templateManager.backupDirectory(
                  githubPath
                );
                if (backupPath) {
                  console.log(`Backed up existing templates to: ${backupPath}`);
                }

                progress.report({
                  increment: 30,
                  message: "Preparing deployment configuration...",
                });

                // Dynamically discover files to always deploy
                const alwaysDeployFiles =
                  await templateManager.discoverAlwaysDeployFiles();

                // Recreate deployment config from stored settings
                const deploymentConfig: DeploymentConfig = {
                  alwaysDeploy: alwaysDeployFiles,
                  conditionalDeploy: {
                    "instructions.python": languages.includes("python")
                      ? [".github/instructions/python.instructions.md"]
                      : [],
                    "instructions.typescript": languages.includes("typescript")
                      ? [
                          ".github/instructions/typescript-5-es2022.instructions.md",
                        ]
                      : [],
                    "instructions.csharp": languages.includes("C#")
                      ? [".github/instructions/csharp.instructions.md"]
                      : [],
                    "instructions.reactjs": languages.includes("react")
                      ? [".github/instructions/reactjs.instructions.md"]
                      : [],
                    "instructions.bicep": languages.includes("bicep")
                      ? [
                          ".github/instructions/bicep-code-best-practices.instructions.md",
                        ]
                      : [],
                    "instructions.dotnetFramework": languages.includes(
                      "netframework"
                    )
                      ? [
                          ".github/instructions/dotnet-framework.instructions.md",
                        ]
                      : [],
                    "instructions.markdown": languages.includes("markdown")
                      ? [".github/instructions/markdown.instructions.md"]
                      : [],
                    "instructions.azureDevOpsPipelines": languages.includes(
                      "azuredevopspipelines"
                    )
                      ? [
                          ".github/instructions/azure-devops-pipelines.instructions.md",
                        ]
                      : [],
                  },
                  workspaceMCPs: mcpServers,
                };

                progress.report({
                  increment: 50,
                  message: "Deploying updated templates...",
                });

                // Deploy templates
                await templateManager.deployTemplates(deploymentConfig);

                progress.report({
                  increment: 10,
                  message: "Templates updated successfully",
                });
              }
            );

            vscode.window.showInformationMessage(
              "Nexkit templates updated successfully!"
            );
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to update templates: ${error}`
            );
            throw error;
          }
        }
      );
    }
  );

  const reinitializeProjectDisposable = vscode.commands.registerCommand(
    "nexkit-vscode.reinitializeProject",
    async () => {
      await telemetryService.trackCommandExecution(
        "reinitializeProject",
        async () => {
          try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
              vscode.window.showErrorMessage(
                "No workspace folder open. Please open a workspace first."
              );
              return;
            }

            const confirm = await vscode.window.showWarningMessage(
              "This will run the initialization wizard again and reconfigure your Nexkit settings. Continue?",
              { modal: true },
              "Re-initialize",
              "Cancel"
            );

            if (confirm !== "Re-initialize") {
              return;
            }

            // Run the init project command (it already handles re-initialization)
            await vscode.commands.executeCommand("nexkit-vscode.initProject");
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to re-initialize project: ${error}`
            );
            throw error;
          }
        }
      );
    }
  );

  const checkExtensionUpdateDisposable = vscode.commands.registerCommand(
    "nexkit-vscode.checkExtensionUpdate",
    async () => {
      await telemetryService.trackCommandExecution(
        "checkExtensionUpdate",
        async () => {
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

                const extensionUpdateManager = new ExtensionUpdateManager(
                  context
                );
                const updateInfo =
                  await extensionUpdateManager.checkForExtensionUpdate();

                if (!updateInfo) {
                  vscode.window.showInformationMessage(
                    "Nexkit extension is up to date!"
                  );
                  return;
                }

                progress.report({
                  increment: 70,
                  message: "Update available...",
                });

                // Prompt user for update action
                await extensionUpdateManager.promptUserForUpdate(updateInfo);
              }
            );
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to check for extension updates: ${error}`
            );
            throw error;
          }
        }
      );
    }
  );

  context.subscriptions.push(
    initProjectDisposable,
    installUserMCPsDisposable,
    configureAzureDevOpsDisposable,
    openSettingsDisposable,
    restoreBackupDisposable,
    updateTemplatesDisposable,
    reinitializeProjectDisposable,
    checkExtensionUpdateDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
