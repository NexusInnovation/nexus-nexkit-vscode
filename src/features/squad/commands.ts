import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { SquadError, isSquadErr } from "./models";

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

/**
 * Register the Squad import command (SQD-034, FR-062): choose an export file,
 * build a preview, then apply it. Applying asks for explicit confirmation
 * (showing the preview) and backs up existing artifacts before the CLI runs.
 */
export function registerSquadImportCommand(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): void {
  registerCommand(
    context,
    Commands.IMPORT_SQUAD,
    async () => {
      const preview = await services.squadImport.previewImport();
      if (isSquadErr(preview)) {
        await showSquadImportError(preview.error);
        return;
      }

      const result = await services.squadImport.applyImport({ previewId: preview.value.previewId });
      if (isSquadErr(result)) {
        await showSquadImportError(result.error);
        return;
      }

      await vscode.window.showInformationMessage(
        `Squad imported: ${result.value.agentCount} agent(s), ${result.value.skillCount} skill(s).` +
          (result.value.backupCreated ? " Previous Squad files were backed up." : "")
      );
    },
    services.telemetry
  );
}

async function showSquadImportError(error: SquadError): Promise<void> {
  if (error.code === "cancelled") {
    await vscode.window.showInformationMessage(error.message);
    return;
  }
  const message = error.remediation ? `${error.message} ${error.remediation}` : error.message;
  await vscode.window.showErrorMessage(message);
}
