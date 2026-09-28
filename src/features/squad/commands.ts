import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { isSquadErr } from "./models";

/** Register Squad feature commands. */
export function registerSquadExportCommand(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): void {
  registerCommand(
    context,
    Commands.EXPORT_SQUAD,
    async () => {
      const result = await services.squadExport.exportSquad();
      if (isSquadErr(result)) {
        const message = result.error.remediation
          ? `${result.error.message} ${result.error.remediation}`
          : result.error.message;
        await vscode.window.showErrorMessage(message);
        return;
      }

      await vscode.window.showInformationMessage("Squad export completed.");
    },
    services.telemetry
  );
}
