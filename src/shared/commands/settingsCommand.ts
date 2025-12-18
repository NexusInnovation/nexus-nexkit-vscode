import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "./commandRegistry";

/**
 * Register settings-related commands
 */
export function registerSettingsCommands(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    "nexus-nexkit-vscode.openSettings",
    async () => {
      await vscode.commands.executeCommand("workbench.action.openSettings", "nexkit");
    },
    services.telemetry
  );
}
