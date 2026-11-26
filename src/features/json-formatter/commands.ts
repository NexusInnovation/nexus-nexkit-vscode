import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

export function registerOpenJsonFormatterCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.OPEN_JSON_FORMATTER,
    async () => {
      services.jsonFormatter.openPanel();
    },
    services.telemetry
  );
}