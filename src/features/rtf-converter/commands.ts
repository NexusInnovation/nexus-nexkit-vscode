import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

/**
 * Register the command that opens the standalone RTF to Markdown converter panel
 */
export function registerOpenRtfConverterCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.OPEN_RTF_CONVERTER,
    async () => {
      services.rtfConverter.openPanel();
    },
    services.telemetry
  );
}
