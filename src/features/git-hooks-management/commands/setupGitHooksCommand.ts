import * as vscode from "vscode";
import { ServiceContainer } from "../../../core/serviceContainer";
import { registerCommand } from "../../../shared/commands/commandRegistry";
import { Commands } from "../../../shared/constants/commands";

/**
 * Register the command to setup Git Hooks for the workspace
 */
export function registerSetupGitHooksCommand(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): void {
  registerCommand(
    context,
    Commands.SETUP_GIT_HOOKS,
    async () => {
      const status = await services.gitHooks.getStatus();

      if (status.isInstalled) {
        const reinstall = await vscode.window.showQuickPick(
          [
            { label: "Yes, reinstall", picked: false },
            { label: "No, cancel", picked: true },
          ],
          { placeHolder: "Git hooks are already installed. Reinstall?" }
        );

        if (reinstall?.label !== "Yes, reinstall") {
          return;
        }
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Setting up Git Hooks..." },
        async (progress) => {
          progress.report({ increment: 50 });
          await services.gitHooks.setup();
          progress.report({ increment: 50 });
        }
      );

      vscode.window.showInformationMessage("Git Hooks setup completed successfully!");
    },
    services.telemetry
  );
}

