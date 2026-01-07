import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "./commandRegistry";
import { Commands } from "../constants/commands";

/**
 * Register settings-related commands
 */
export function registerOpenFeedbackCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.OPEN_FEEDBACK,
    async () => {
      const extensionVersion = context.extension.packageJSON.version;
      const vscodeVersion = vscode.version;

      const repoUrl = "https://github.com/NexusInnovation/nexus-nexkit-vscode";
      const issueTitle = encodeURIComponent("[Feedback] <insert brief title here>");
      const issueBody = encodeURIComponent(
        `<!-- Please describe your feedback here -->\n\n---\n\n**Extension Version:** ${extensionVersion}\n**VS Code Version:** ${vscodeVersion}`
      );

      const url = `${repoUrl}/issues/new?title=${issueTitle}&body=${issueBody}`;

      await vscode.env.openExternal(vscode.Uri.parse(url));
    },
    services.telemetry
  );
}
