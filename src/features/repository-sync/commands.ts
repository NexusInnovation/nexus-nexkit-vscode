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
      const result = await services.repositorySyncScheduler.runSync();
      services.repositorySyncStatusBar.updateLastRun(result);
      vscode.window.showInformationMessage(
        `Nexkit repository sync completed for ${result.results.length} repositories.`
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
