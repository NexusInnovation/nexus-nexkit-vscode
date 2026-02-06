import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { NexkitResetService } from "./nexkitResetService";

/**
 * Register reset-related commands
 */
export function registerResetNexkitCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  const resetService = new NexkitResetService();

  registerCommand(
    context,
    Commands.RESET_NEXKIT,
    async () => {
      // Prompt for confirmation
      const confirmed = await resetService.confirmReset();
      if (!confirmed) {
        return;
      }

      try {
        // Perform reset
        await resetService.resetToInitialState(context);

        // Show success message and prompt to reload
        const reloadResult = await vscode.window.showInformationMessage(
          "Nexkit has been reset to its initial state. Please reload VS Code for changes to take full effect.",
          "Reload Window",
          "Later"
        );

        if (reloadResult === "Reload Window") {
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to reset Nexkit: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    services.telemetry
  );
}
