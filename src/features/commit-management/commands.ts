import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

/**
 * Register the command that generates an AI commit message for staged changes
 */
export function registerGenerateCommitMessageCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.GENERATE_COMMIT_MESSAGE,
    async () => {
      await services.commitMessage.generateCommitMessage();
    },
    services.telemetry
  );
}
