import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

/**
 * Register extension update commands
 */
export function registerCheckExtensionUpdateCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.CHECK_EXTENSION_UPDATE,
    async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Checking for extension updates...",
          cancellable: false,
        },
        async () => {
          const updateInfo = await services.extensionUpdate.checkForExtensionUpdate();

          if (!updateInfo) {
            vscode.window.showInformationMessage("Nexkit extension is up to date!");
            return;
          }

          services.extensionUpdate.promptUserForUpdate(updateInfo);
        }
      );
    },
    services.telemetry
  );
}
