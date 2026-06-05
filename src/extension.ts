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
import {
  registerApplyProfileCommand,
  registerDeleteProfileCommand,
  registerSaveProfileCommand,
} from "./features/profile-management/commands";
import { registerOpenFeedbackCommand } from "./shared/commands/feedbackCommand";
import { registerShowLogsCommand } from "./shared/commands/loggingCommand";
import { registerAddDevOpsConnectionCommand, registerRemoveDevOpsConnectionCommand } from "./features/apm-devops/commands";
import { registerGenerateCommitMessageCommand } from "./features/commit-management/commands";
import { registerMigrateToUserDirectoryCommand } from "./features/initialization/migrationCommand";

/**
 * Extension activation
 * This method is called when the
 * extension is first activated
 */
export async function activate(context: vscode.ExtensionContext) {
  // Initialize core settings manager
  SettingsManager.initialize(context);

  // Initialize all services
  const services = await initializeServices(context);

  services.logging.info("Nexkit extension activated successfully");

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
  registerShowLogsCommand(context, services);
  registerOpenFeedbackCommand(context, services);
  registerSaveProfileCommand(context, services);
  registerApplyProfileCommand(context, services);
  registerDeleteProfileCommand(context, services);
  registerAddDevOpsConnectionCommand(context, services);
  registerRemoveDevOpsConnectionCommand(context, services);
  registerGenerateCommitMessageCommand(context, services);
  registerMigrateToUserDirectoryCommand(context, services);

  // Register webview panel
  const nexkitPanelProvider = new NexkitPanelViewProvider();
  nexkitPanelProvider.initialize(context, services);

  // Check for extension updates on activation & cleanup old .vsix files
  services.extensionUpdate.checkForExtensionUpdatesOnActivation();
  services.extensionUpdate.cleanupOldVsixFilesOnActivation();

  // Initialize status bar
  services.updateStatusBar.initializeUpdateStatusBar();

  // Check for required MCP servers on activation
  services.mcpConfig.promptInstallRequiredMCPsOnActivation();

  // Run startup verification checks (settings, gitignore, file migration, auth)
  services.startupVerification.verifyOnStartup().catch((error) => {
    services.logging.error("Failed to run startup verification", error);
    services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
      context: "startupVerification.verifyOnStartup",
    });
  });

  // Check for workspace-to-user migration (deferred, non-blocking)
  services.workspaceToUserMigration.checkAndPromptMigration(context).catch((error) => {
    services.logging.error("Failed to check workspace migration", error);
    services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
      context: "workspaceToUserMigration.checkAndPromptMigration",
    });
  });

  // Initialize AI template data asynchronously (don't block extension activation)
  services.aiTemplateData
    .initialize()
    .then(() => {
      // Start background metadata scan after templates are loaded
      services.templateMetadataScanner.startScan().catch((error) => {
        services.logging.error("Failed to complete metadata scan", error);
        services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
          context: "templateMetadataScanner.startScan",
        });
      });
    })
    .catch((error) => {
      services.logging.error("Failed to initialize AI template data", error);
      // Track initialization errors
      services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
        context: "aiTemplateData.initialize",
      });
    });

  // Sync installed templates state with filesystem on activation
  services.aiTemplateData.syncInstalledTemplates();

  // Start watching .nexkit/ directory for external changes
  services.nexkitFileWatcher.startWatching().catch((error) => {
    services.logging.error("Failed to start .nexkit file watcher", error);
  });

  // Watch for template repository configuration changes (to refetch templates)
  services.aiTemplateData.setupConfigurationWatcher();

  // Periodically check remote GitHub repos for new commits and auto-refresh templates
  services.aiTemplateData.setupRemoteAutoRefresh();

}

/**
 * Set up global error handling to track all unhandled errors
 */
function setupGlobalErrorHandling(services: ReturnType<typeof initializeServices> extends Promise<infer T> ? T : never): void {
  // Track unhandled promise rejections
  process.on("unhandledRejection", (reason: any) => {
    services.logging.error("Unhandled promise rejection", reason);
    const error = reason instanceof Error ? reason : new Error(String(reason));
    services.telemetry.trackError(error, { context: "unhandledRejection" });
  });

  // Track uncaught exceptions (less common in VS Code extensions)
  process.on("uncaughtException", (error: Error) => {
    services.logging.error("Uncaught exception", error);
    services.telemetry.trackError(error, { context: "uncaughtException" });
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
