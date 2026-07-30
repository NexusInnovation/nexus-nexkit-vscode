import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { OrchestrationResult } from "./types";

const SHOW_LOGS_ACTION = "Show Logs";

/**
 * Registers the command that validates the open workspace's development prerequisites.
 */
export function registerValidatePrerequisitesCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.VALIDATE_PREREQUISITES,
    async () => {
      if (!SettingsManager.isPrerequisitesEnabled()) {
        void vscode.window.showInformationMessage(
          "Prerequisite validation is disabled. Enable \"nexkit.prerequisites.enabled\" to use it."
        );
        return;
      }

      const result = await services.prerequisiteOrchestrator.run();
      await reportOutcome(result, services);
    },
    services.telemetry
  );
}

async function reportOutcome(result: OrchestrationResult, services: ServiceContainer): Promise<void> {
  switch (result.outcome) {
    case "notConfigured":
      // The common case across arbitrary workspaces: calm, never an error dialog.
      void vscode.window.showInformationMessage(
        "No prerequisites configuration was found in this workspace, so there is nothing to validate."
      );
      return;

    case "alreadyValidated":
      void vscode.window.showInformationMessage("Development prerequisites are already validated.");
      return;

    case "validated":
      void vscode.window.showInformationMessage("Development prerequisites are validated.");
      return;

    case "declined":
    case "setupDeclined":
    case "cancelled":
      return;

    case "alreadyRunning":
      void vscode.window.showWarningMessage(
        result.error?.toUserMessage() ?? "A prerequisite validation run is already in progress."
      );
      return;

    default:
      await showFailure(result, services);
  }
}

async function showFailure(result: OrchestrationResult, services: ServiceContainer): Promise<void> {
  const message = result.error?.toUserMessage() ?? "Prerequisite validation did not complete successfully.";
  const choice = await vscode.window.showErrorMessage(message, SHOW_LOGS_ACTION);
  if (choice === SHOW_LOGS_ACTION) {
    services.logging.show();
  }
}
