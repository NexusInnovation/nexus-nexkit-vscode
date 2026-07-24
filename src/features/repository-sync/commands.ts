import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

export function registerRunRepositorySyncCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.REPOSITORY_SYNC_RUN_ONCE,
    async () => {
      const retryFailedOnlyChoice = "Retry Failed Only";
      const fullRunChoice = "Run Full Sync";

      const selection = await vscode.window.showQuickPick([fullRunChoice, retryFailedOnlyChoice], {
        placeHolder: "Choose repository sync mode",
        ignoreFocusOut: true,
      });

      if (!selection) {
        return;
      }

      services.repositorySyncStatusBar.setRunning();
      const result = await services.repositorySyncScheduler.runSync({
        retryFailedOnly: selection === retryFailedOnlyChoice,
        interactiveTrust: true,
      });
      services.repositorySyncStatusBar.updateLastRun(result);

      const summary = result.summary;
      vscode.window.showInformationMessage(
        `Repository sync finished: ${summary.successReady} ready, ${summary.skipped} skipped, ` +
          `${summary.conflictRisk} warnings, ${summary.failed} failed.`
      );
    },
    services.telemetry
  );
}

export function registerToggleRepositorySyncCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.REPOSITORY_SYNC_TOGGLE,
    async () => {
      const enabled = SettingsManager.isRepoSyncEnabled();
      await SettingsManager.setRepoSyncEnabled(!enabled);

      if (!enabled) {
        services.repositorySyncScheduler.start();
        if (SettingsManager.isRepoSyncStatusBarEnabled()) {
          services.repositorySyncStatusBar.show();
        }
      } else {
        services.repositorySyncScheduler.stop();
        services.repositorySyncStatusBar.hide();
      }

      vscode.window.showInformationMessage(`Nexkit repository sync ${enabled ? "disabled" : "enabled"}.`);
    },
    services.telemetry
  );
}
