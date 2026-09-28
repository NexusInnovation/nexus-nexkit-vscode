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

/** Register the confirmed, backed-up Squad project upgrade command (SQD-032). */
export function registerSquadUpgradeProjectCommand(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): void {
  registerCommand(
    context,
    Commands.UPGRADE_SQUAD_PROJECT,
    async () => {
      const result = await services.squadProjectUpgrade.upgradeProject();
      if (isSquadErr(result)) {
        if (result.error.code === "cancelled") {
          return;
        }
        const message = result.error.remediation
          ? `${result.error.message} ${result.error.remediation}`
          : result.error.message;
        await vscode.window.showErrorMessage(message);
        return;
      }

      const outcome = result.value;
      if (!outcome.upgraded) {
        await vscode.window.showInformationMessage(
          `The Squad project is already up to date (${outcome.currentVersion ?? "unknown version"}).`
        );
        return;
      }

      const version = outcome.currentVersion ?? outcome.targetVersion;
      await vscode.window.showInformationMessage(
        version
          ? `Squad project upgraded to ${version}. A backup was created before upgrading.`
          : "Squad project upgraded. A backup was created before upgrading."
      );
    },
    services.telemetry
  );
}
