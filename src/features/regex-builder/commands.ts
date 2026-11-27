import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

export function registerOpenRegexBuilderCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.OPEN_REGEX_BUILDER,
    async () => {
      services.regexBuilder.openPanel();
    },
    services.telemetry
  );
}
