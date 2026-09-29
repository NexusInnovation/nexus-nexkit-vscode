import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { SquadWatchState, isSquadErr } from "./models";

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

/** Register command-palette actions for starting/stopping `squad watch`. */
export function registerSquadWatchCommands(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.START_SQUAD_WATCH,
    async () => {
      const result = services.squadWatch.start({ cwd: vscode.workspace.workspaceFolders?.[0]?.uri });
      if (isSquadErr(result)) {
        await vscode.window.showErrorMessage(_formatSquadError(result.error));
        return;
      }

      const status = result.value.status.state;
      await vscode.window.showInformationMessage(
        status === SquadWatchState.Running ? "Squad watch started." : "Squad watch is starting."
      );
    },
    services.telemetry
  );

  registerCommand(
    context,
    Commands.STOP_SQUAD_WATCH,
    async () => {
      const result = services.squadWatch.stop();
      if (isSquadErr(result)) {
        await vscode.window.showErrorMessage(_formatSquadError(result.error));
        return;
      }

      const status = result.value.status.state;
      await vscode.window.showInformationMessage(
        status === SquadWatchState.Stopped ? "Squad watch stopped." : "Squad watch is stopping."
      );
    },
    services.telemetry
  );
}

function _formatSquadError(error: { message: string; remediation?: string }): string {
  return error.remediation ? `${error.message} ${error.remediation}` : error.message;
}
