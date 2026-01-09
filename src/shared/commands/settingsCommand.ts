import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "./commandRegistry";
import { Commands } from "../constants/commands";

/**
 * Register settings-related commands
 */
export function registerOpenSettingsCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.OPEN_SETTINGS,
    async () => {
      await vscode.commands.executeCommand("workbench.action.openSettings", "nexkit");
    },
    services.telemetry
  );
}
