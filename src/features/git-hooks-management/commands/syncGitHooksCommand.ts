import * as vscode from "vscode";
import { ServiceContainer } from "../../../core/serviceContainer";
import { registerCommand } from "../../../shared/commands/commandRegistry";
import { Commands } from "../../../shared/constants/commands";

/**
 * Register the command to sync Git Hooks rules from GitHub
 */
export function registerSyncGitHooksCommand(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): void {
  registerCommand(
    context,
    Commands.SYNC_GIT_HOOKS,
    async () => {
      const status = await services.gitHooks.getStatus();

      if (!status.isInstalled) {
        const install = await vscode.window.showQuickPick(
          [
            { label: "Yes, install", picked: true },
            { label: "No, cancel", picked: false },
          ],
          { placeHolder: "Git hooks are not installed. Install now?" }
        );

        if (install?.label !== "Yes, install") {
          return;
        }

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Installing Git Hooks..." },
          async (progress) => {
            progress.report({ increment: 50 });
            await services.gitHooks.setup();
            progress.report({ increment: 50 });
          }
        );
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Syncing Git Hooks rules..." },
        async (progress) => {
          progress.report({ increment: 50 });
          await services.gitHooks.syncWithGitHub();
          progress.report({ increment: 50 });
        }
      );

      vscode.window.showInformationMessage("Git Hooks rules synced successfully!");
    },
    services.telemetry
  );
}

