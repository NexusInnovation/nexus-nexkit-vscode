import * as vscode from "vscode";
import { registerCommand } from "./commandRegistry";
import { Commands } from "../constants/commands";
import { ServiceContainer } from "../../core/serviceContainer";

/**
 * Register the show logs command
 */
export function registerShowLogsCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.SHOW_LOGS,
    async () => {
      services.logging.show();
    },
    services.telemetry
  );
}
