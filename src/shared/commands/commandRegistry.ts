import * as vscode from "vscode";
import { TelemetryService } from "../services/telemetryService";

/**
 * Helper function to register a command with telemetry tracking and error handling
 */
export function registerCommand(
  context: vscode.ExtensionContext,
  commandId: string,
  handler: () => Promise<void>,
  telemetry: TelemetryService
): void {
  const disposable = vscode.commands.registerCommand(commandId, async () => {
    await telemetry.trackCommandExecution(commandId, async () => {
      try {
        await handler();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Command failed: ${errorMessage}`);
        throw error;
      }
    });
  });

  context.subscriptions.push(disposable);
}
