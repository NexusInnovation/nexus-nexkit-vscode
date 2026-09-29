import * as vscode from "vscode";
import { SettingsManager } from "./core/settingsManager";
import { initializeServices, ServiceContainer } from "./core/serviceContainer";
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
import { registerOpenConvertToMarkdownCommand } from "./features/convert-to-markdown/commands";
import {
  registerSquadExportCommand,
  registerSquadUpgradeCliCommand,
  registerSquadUpgradeProjectCommand,
} from "./features/squad/commands";

/**
 * Extension activation
 * This method is called when the
 * extension is first activated
 */
export async function activate(context: vscode.ExtensionContext) {
  // Initialize core settings manager
  SettingsManager.initialize(context);
  void updateModeSelectedContext();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("nexkit.mode")) {
        void updateModeSelectedContext();
      }
    })
  );

  // Initialize all services (construction only — no network or heavy I/O)
  const services = await initializeServices(context);

  // Register the webview panel as early as possible so it can render its
  // skeleton immediately while data loads in the background.
  const nexkitPanelProvider = new NexkitPanelViewProvider();
  nexkitPanelProvider.initialize(context, services);

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
  registerOpenConvertToMarkdownCommand(context, services);
  registerSquadExportCommand(context, services);
  registerSquadUpgradeProjectCommand(context, services);
  registerSquadUpgradeCliCommand(context, services);

  // Lightweight watchers: register synchronously so no change event is missed
  services.aiTemplateData.setupConfigurationWatcher();
  services.aiTemplateData.setupRemoteAutoRefresh();

  scheduleBackgroundStartup(context, services);

  services.logging.info("Nexkit extension activated successfully");
}

/**
 * Delay before non-essential startup work (update checks, prompts, cleanup) so
 * it does not compete with the panel's first data load.
 */
const DEFERRED_STARTUP_DELAY_MS = 3000;

/**
 * Run every initialization task in the background, off the activation path.
 *
 * - Essential data (templates, installed state, startup verification, file
 *   watcher) starts on the next tick so activation returns immediately.
 * - Non-essential work (extension update check, status bar, MCP prompt, .vsix
 *   cleanup) starts after {@link DEFERRED_STARTUP_DELAY_MS}.
 *
 * Each task is isolated: a failure is logged and never blocks the others.
 */
function scheduleBackgroundStartup(context: vscode.ExtensionContext, services: ServiceContainer): void {
  const runTask = (name: string, task: () => Promise<unknown> | void): void => {
    Promise.resolve()
      .then(task)
      .catch((error) => {
        services.logging.error(`Background startup task failed: ${name}`, error);
        services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), { context: name });
      });
  };

  const essentialHandle = setImmediate(() => {
    // Run startup verification checks (settings, gitignore, file migration, auth)
    runTask("startupVerification.verifyOnStartup", () => services.startupVerification.verifyOnStartup());

    // Initialize AI template data, then build the metadata index for fuzzy search
    runTask("aiTemplateData.initialize", async () => {
      await services.aiTemplateData.initialize();
      runTask("templateMetadataScanner.startScan", () => services.templateMetadataScanner.startScan());
    });

    // Sync installed templates state with filesystem
    runTask("aiTemplateData.syncInstalledTemplates", () => services.aiTemplateData.syncInstalledTemplates());

    // Start watching .nexkit/ directory for external changes
    runTask("nexkitFileWatcher.startWatching", () => services.nexkitFileWatcher.startWatching());
  });

  const deferredHandle = setTimeout(() => {
    runTask("extensionUpdate.checkForExtensionUpdatesOnActivation", () =>
      services.extensionUpdate.checkForExtensionUpdatesOnActivation()
    );
    runTask("extensionUpdate.cleanupOldVsixFilesOnActivation", () =>
      services.extensionUpdate.cleanupOldVsixFilesOnActivation()
    );
    runTask("updateStatusBar.initializeUpdateStatusBar", () => services.updateStatusBar.initializeUpdateStatusBar());
    runTask("mcpConfig.promptInstallRequiredMCPsOnActivation", () =>
      services.mcpConfig.promptInstallRequiredMCPsOnActivation()
    );
  }, DEFERRED_STARTUP_DELAY_MS);

  context.subscriptions.push({
    dispose: () => {
      clearImmediate(essentialHandle);
      clearTimeout(deferredHandle);
    },
  });
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
