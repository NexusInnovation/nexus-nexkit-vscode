import * as vscode from "vscode";
import { SettingsManager } from "./core/settingsManager";
import { initializeServices } from "./core/serviceContainer";
import { NexkitPanelViewProvider } from "./features/panel-ui/nexkitPanelViewProvider";
import { registerInitializationCommands } from "./features/initialization";
import { registerMcpCommands } from "./features/mcp-management";
import { registerBackupCommands } from "./features/backup-management";
import { registerSettingsCommands } from "./shared/commands/settingsCommand";
import { registerUpdateCommands } from "./features/extension-updates/checkUpdateCommand";

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
    context,
    services.repositoryAggregator,
    services.workspaceAIResource,
    services.telemetry
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("nexkitPanelView", nexkitPanelProvider, {
      webviewOptions: { retainContextWhenHidden: true }, // todo: maybe disable retainContextWhenHidden for performance
    })
  );

  // Check for extension updates on activation & cleanup old .vsix files
  services.extensionUpdate.checkForExtensionUpdatesOnActivation();
  services.extensionUpdate.cleanupOldVsixFilesOnActivation();

  // Initialize status bar
  services.updateStatusBar.initializeUpdateStatusBar();

  // Check for required MCP servers on activation
  services.mcpConfig.checkRequiredMCPs();

  // Register all commands
  registerInitializationCommands(context, services);
  registerMcpCommands(context, services);
  registerBackupCommands(context, services);
  registerUpdateCommands(context, services);
  registerSettingsCommands(context, services);
}

// This method is called when your extension is deactivated
export function deactivate() {}
