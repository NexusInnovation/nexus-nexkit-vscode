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
      const updateInfo = await services.extensionUpdate.checkForExtensionUpdate();

      if (!updateInfo) {
        vscode.window.showInformationMessage("Nexkit extension is up to date!");
        return;
      }

      await services.extensionUpdate.promptUserForUpdate(updateInfo);
    },
    services.telemetry
  );
}
