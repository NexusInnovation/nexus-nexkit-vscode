import * as vscode from "vscode";
import { SettingsManager } from "./core/settingsManager";
import { initializeServices } from "./core/serviceContainer";
import { NexkitPanelViewProvider } from "./features/panel-ui/nexkitPanelViewProvider";
import { registerInitializationCommands } from "./features/initialization";
import { registerMcpCommands } from "./features/mcp-management";
import { registerBackupCommands } from "./features/backup-management";
import { registerUpdateCommands } from "./features/extension-updates";
import { registerSettingsCommands } from "./shared/commands/settingsCommand";

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

  // Register webview panel
  const nexkitPanelProvider = new NexkitPanelViewProvider(
    services.repositoryAggregator,
    services.workspaceAIResource,
    services.telemetry
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("nexkitPanelView", nexkitPanelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Listen for workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      nexkitPanelProvider.updateWorkspaceState(hasWorkspace);
    })
  );

  // Initialize status bar
  await services.statusBar.updateStatusBar();

  // Check for required MCP servers on activation
  services.mcpConfig.checkRequiredMCPs();

  // Check for extension updates on activation
  services.extensionUpdate.checkForExtensionUpdatesOnActivation();

  // Register all commands
  registerInitializationCommands(context, services);
  registerMcpCommands(context, services);
  registerBackupCommands(context, services);
  registerUpdateCommands(context, services);
  registerSettingsCommands(context, services);
}

// This method is called when your extension is deactivated
export function deactivate() {}
