import * as vscode from "vscode";
import { SettingsManager } from "./core/settingsManager";
import { initializeServices } from "./core/serviceContainer";
import { NexkitPanelViewProvider } from "./features/panel-ui/nexkitPanelViewProvider";
import {
  registerGoToModeSelectionCommand,
  registerInitializeWorkspaceCommand,
  registerSwitchModeCommand,
} from "./features/initialization/commands";
import { OperationMode } from "./features/ai-template-files/models/aiTemplateFile";
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
import { registerOpenRtfConverterCommand } from "./features/rtf-converter/commands";

/**
 * Extension activation
 * This method is called when the
 * extension is first activated
 */
export async function activate(context: vscode.ExtensionContext) {
  // Initialize core settings manager
  SettingsManager.initialize(context);
  await updateModeSelectedContext();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("nexkit.mode")) {
        void updateModeSelectedContext();
      }
    })
  );

  // Initialize all services
  const services = await initializeServices(context);

  services.logging.info("Nexkit extension activated successfully");

  // Set up global error handler to track Nexkit-owned unhandled errors
  setupGlobalErrorHandling(services, context.extensionUri.fsPath);

  // Register all commands
  registerInitializeWorkspaceCommand(context, services);
  registerGoToModeSelectionCommand(context, services);
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
  registerOpenRtfConverterCommand(context, services);

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

async function updateModeSelectedContext(): Promise<void> {
  await vscode.commands.executeCommand("setContext", "nexkit.modeSelected", SettingsManager.getMode() !== OperationMode.None);
}

/**
 * Set up global error handling to track Nexkit-owned unhandled errors
 */
function setupGlobalErrorHandling(
  services: ReturnType<typeof initializeServices> extends Promise<infer T> ? T : never,
  extensionRoot: string
): void {
  const isInspectorInternalError = (error: unknown): boolean => {
    if (!(error instanceof Error) || error.message !== "Missing dataLength in event") {
      return false;
    }

    return error.stack?.includes("node:inspector") || error.stack?.includes("node:internal/inspector/") || false;
  };

  // Helper function to sanitize error objects before logging
  // This prevents debugger protocol violations when errors contain non-serializable objects
  const sanitizeError = (error: any): Error => {
    try {
      if (error instanceof Error) {
        // Create a new plain Error with only message and stack (both serializable)
        const sanitized = new Error(error.message);
        sanitized.stack = error.stack;
        return sanitized;
      } else if (typeof error === "string") {
        return new Error(error);
      } else if (error !== null && typeof error === "object") {
        // Try to extract a meaningful message from the object
        const message = (error.message || error.msg || error.reason || error.toString());
        return new Error(String(message));
      } else {
        return new Error(String(error));
      }
    } catch (sanitizeError) {
      // If sanitization itself fails, return a generic error
      return new Error("Unknown error occurred during error processing");
    }
  };

  // Track unhandled promise rejections
  process.on("unhandledRejection", (reason: any) => {
    if (isInspectorInternalError(reason)) {
      return;
    }

    if (!isNexkitOwnedException(reason, extensionRoot)) {
      return;
    }

    const sanitizedError = sanitizeError(reason);
    services.logging.error("Unhandled promise rejection", sanitizedError);
    services.telemetry.trackError(sanitizedError, { context: "unhandledRejection" });
  });

  // Track uncaught exceptions (less common in VS Code extensions)
  process.on("uncaughtException", (error: Error) => {
    if (isInspectorInternalError(error)) {
      return;
    }

    if (!isNexkitOwnedException(error, extensionRoot)) {
      return;
    }

    const sanitizedError = sanitizeError(error);
    services.logging.error("Uncaught exception", sanitizedError);
    services.telemetry.trackError(sanitizedError, { context: "uncaughtException" });
  });
}

/**
 * Returns whether an unhandled error originated in Nexkit's compiled extension code.
 */
export function isNexkitOwnedException(error: unknown, extensionRoot: string): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const errorDetails = error as { stack?: unknown; nexkitOwned?: unknown };
  if (typeof errorDetails.stack === "string") {
    const normalizedRoot = extensionRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedStack = errorDetails.stack.replace(/\\/g, "/");
    return normalizedStack.includes(`${normalizedRoot}/out/`);
  }

  return errorDetails.nexkitOwned === true;
}

// This method is called when your extension is deactivated
export function deactivate() {}
