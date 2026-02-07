import * as vscode from "vscode";
import { SettingsManager } from "./core/settingsManager";
import { initializeServices } from "./core/serviceContainer";
import { NexkitPanelViewProvider } from "./features/panel-ui/nexkitPanelViewProvider";
import { registerInitializeWorkspaceCommand, registerSwitchModeCommand } from "./features/initialization/commands";
import { registerResetWorkspaceCommand } from "./features/initialization/resetCommand";
import { registerInstallUserMCPsCommand } from "./features/mcp-management/commands";
import { registerCleanupBackupCommand, registerRestoreBackupCommand } from "./features/backup-management/commands";
import { registerOpenSettingsCommand } from "./shared/commands/settingsCommand";
import { registerCheckExtensionUpdateCommand } from "./features/extension-updates/commands";
import { registerUpdateInstalledTemplatesCommand } from "./features/ai-template-files/commands";
import { registerResetNexkitCommand } from "./features/reset/commands";
import {
  registerApplyProfileCommand,
  registerDeleteProfileCommand,
  registerSaveProfileCommand,
} from "./features/profile-management/commands";
import { registerOpenFeedbackCommand } from "./shared/commands/feedbackCommand";
import { registerAddDevOpsConnectionCommand, registerRemoveDevOpsConnectionCommand } from "./features/apm-devops/commands";

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

  // Set up global error handler to track all unhandled errors
  setupGlobalErrorHandling(services);

  // Register all commands
  registerInitializeWorkspaceCommand(context, services);
  registerSwitchModeCommand(context, services);
  registerResetWorkspaceCommand(context, services);
  registerInstallUserMCPsCommand(context, services);
  registerRestoreBackupCommand(context, services);
  registerCleanupBackupCommand(context, services);
  registerCheckExtensionUpdateCommand(context, services);
  registerUpdateInstalledTemplatesCommand(context, services);
  registerOpenSettingsCommand(context, services);
  registerOpenFeedbackCommand(context, services);
  registerSaveProfileCommand(context, services);
  registerApplyProfileCommand(context, services);
  registerDeleteProfileCommand(context, services);
  registerAddDevOpsConnectionCommand(context, services);
  registerRemoveDevOpsConnectionCommand(context, services);
  registerResetNexkitCommand(context, services);

  // Register webview panel
  const nexkitPanelProvider = new NexkitPanelViewProvider();
  nexkitPanelProvider.initialize(context, services);

  // Prompt for mode selection on first-time activation (before other initialization)
  services.modeSelection.ensureModeSelected().catch((error) => {
    console.error("Failed to prompt for mode selection:", error);
    services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
      context: "modeSelection.ensureModeSelected",
    });
  });

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
    // Track initialization errors
    services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
      context: "aiTemplateData.initialize",
    });
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

/**
 * Set up global error handling to track all unhandled errors
 */
function setupGlobalErrorHandling(services: ReturnType<typeof initializeServices> extends Promise<infer T> ? T : never): void {
  // Track unhandled promise rejections
  process.on("unhandledRejection", (reason: any) => {
    console.error("Unhandled promise rejection:", reason);
    const error = reason instanceof Error ? reason : new Error(String(reason));
    services.telemetry.trackError(error, { context: "unhandledRejection" });
  });

  // Track uncaught exceptions (less common in VS Code extensions)
  process.on("uncaughtException", (error: Error) => {
    console.error("Uncaught exception:", error);
    services.telemetry.trackError(error, { context: "uncaughtException" });
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
