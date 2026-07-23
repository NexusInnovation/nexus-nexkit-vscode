import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

/**
 * Register the command that opens the standalone Convert to Markdown panel
 */
export function registerOpenConvertToMarkdownCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.OPEN_CONVERT_TO_MARKDOWN,
    async () => {
      services.convertToMarkdown.openPanel();
    },
    services.telemetry
  );
}
