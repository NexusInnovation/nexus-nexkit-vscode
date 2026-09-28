import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { SquadCliUpgradeOutcome, SquadError, SquadResult, isSquadErr } from "./models";
import { SquadCliUpgradeOptions } from "./services/squadCliUpgradeService";

/** Register Squad feature commands. */
export function registerSquadExportCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.EXPORT_SQUAD,
    async () => {
      const result = await services.squadExport.exportSquad();
      if (isSquadErr(result)) {
        await vscode.window.showErrorMessage(formatSquadError(result.error));
        return;
      }

      await vscode.window.showInformationMessage("Squad export completed.");
    },
    services.telemetry
  );
}

/** Upgrade seam used by the CLI upgrade command, satisfied by `SquadCliUpgradeService`. */
export interface SquadCliUpgradeCommandUpgrader {
  upgradeCli(options?: SquadCliUpgradeOptions): Promise<SquadResult<SquadCliUpgradeOutcome>>;
}

/** UI seam for the CLI upgrade command so tests never open real notifications. */
export interface SquadCliUpgradeCommandUi {
  withProgress<T>(title: string, task: (token: vscode.CancellationToken) => Promise<T>): Promise<T>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

const vscodeUpgradeUi: SquadCliUpgradeCommandUi = {
  withProgress: async <T>(title: string, task: (token: vscode.CancellationToken) => Promise<T>): Promise<T> =>
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title, cancellable: true },
      async (_progress, token) => task(token)
    ),
  showInformation: async (message: string): Promise<void> => {
    await vscode.window.showInformationMessage(message);
  },
  showError: async (message: string): Promise<void> => {
    await vscode.window.showErrorMessage(message);
  },
};

/**
 * Run the confirmed Squad CLI self-upgrade (SQD-031, FR-005) from the command
 * palette. The service owns confirmation and verification; this only reports
 * the outcome — failures are shown as errors, never as a success message.
 */
export async function runSquadCliUpgradeCommand(
  upgrader: SquadCliUpgradeCommandUpgrader,
  workspaceRoot: vscode.Uri | undefined,
  ui: SquadCliUpgradeCommandUi = vscodeUpgradeUi
): Promise<void> {
  const result = await ui.withProgress("Squad CLI upgrade", (token) => upgrader.upgradeCli({ workspaceRoot, token }));
  if (isSquadErr(result)) {
    await ui.showError(formatSquadError(result.error));
    return;
  }

  const { upgraded, previousVersion, installedVersion } = result.value;
  await ui.showInformation(
    upgraded
      ? `Squad CLI upgraded from ${previousVersion} to ${installedVersion}.`
      : `Squad CLI is already up to date (${installedVersion}).`
  );
}

/** Register the `Nexkit: Upgrade Squad CLI` command. */
export function registerSquadUpgradeCliCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.UPGRADE_SQUAD_CLI,
    async () => runSquadCliUpgradeCommand(services.squadCliUpgrade, vscode.workspace.workspaceFolders?.[0]?.uri),
    services.telemetry
  );
}

function formatSquadError(error: SquadError): string {
  return error.remediation ? `${error.message} ${error.remediation}` : error.message;
}
