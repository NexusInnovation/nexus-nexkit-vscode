import * as vscode from "vscode";
import { SettingsManager } from "./core/settingsManager";
import { initializeServices } from "./core/serviceContainer";
import { NexkitPanelViewProvider } from "./features/panel-ui/nexkitPanelViewProvider";
import { registerInitializeWorkspaceCommand } from "./features/initialization/commands";
import { registerInstallUserMCPsCommand } from "./features/mcp-management/commands";
import { registerCleanupBackupCommand, registerRestoreBackupCommand } from "./features/backup-management/commands";
import { registerSettingsCommands } from "./shared/commands/settingsCommand";
import { registerCheckExtensionUpdateCommand } from "./features/extension-updates/commands";
import { registerUpdateInstalledTemplatesCommand } from "./features/ai-template-files/commands";

/**
 * Extension activation
 * This method is called when the extension is first activated
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log("Nexkit extension activated!");

  // Initialize core settings manager
  SettingsManager.initialize(context);

  // Initialize all services
  const services = await initializeServices(context);

  // Register all commands
  registerInitializeWorkspaceCommand(context, services);
  registerInstallUserMCPsCommand(context, services);
  registerRestoreBackupCommand(context, services);
  registerCleanupBackupCommand(context, services);
  registerCheckExtensionUpdateCommand(context, services);
  registerUpdateInstalledTemplatesCommand(context, services);
  registerSettingsCommands(context, services);

  // Register webview panel
  const nexkitPanelProvider = new NexkitPanelViewProvider(services.telemetry, services.aiTemplateData);
  nexkitPanelProvider.initialize(context);

  // Check for extension updates on activation & cleanup old .vsix files
  services.extensionUpdate.checkForExtensionUpdatesOnActivation();
  services.extensionUpdate.cleanupOldVsixFilesOnActivation();

  // Initialize status bar
  services.updateStatusBar.initializeUpdateStatusBar();

  // Check for required MCP servers on activation
  services.mcpConfig.promptInstallRequiredMCPsOnActivation();

  // Prompt for workspace initialization if needed
  services.workspaceInitPrompt.promptInitWorkspaceOnWorkspaceChange();

  // Initialize AI template data asynchronously (don't block extension activation)
  services.aiTemplateData.initialize().catch((error) => {
    console.error("Failed to initialize AI template data:", error);
  });

  // Sync installed templates state with filesystem on activation
  services.aiTemplateData.syncInstalledTemplates();

  // Watch for template repository configuration changes (to refetch templates)
  services.aiTemplateData.setupConfigurationWatcher();

  // Propose to initialize workspace when changed
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      services.workspaceInitPrompt.promptInitWorkspaceOnWorkspaceChange();
    })
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
