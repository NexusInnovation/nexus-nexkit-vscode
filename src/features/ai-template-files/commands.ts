import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

/**
 * Register AI template-related commands
 */
export function registerUpdateInstalledTemplatesCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.UPDATE_INSTALLED_TEMPLATES,
    async () => {
      // Check if workspace is open
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open. Please open a workspace first.");
        return;
      }

      // Sync installed templates to get accurate count
      await services.aiTemplateData.syncInstalledTemplates();
      const installedRecords = services.aiTemplateData.getInstalledTemplates();

      // Count total installed templates
      const totalInstalled = Object.values(installedRecords).reduce((sum, arr) => sum + arr.length, 0);

      if (totalInstalled === 0) {
        vscode.window.showInformationMessage("No templates are currently installed.");
        return;
      }

      // Show confirmation dialog with count
      const result = await vscode.window.showInformationMessage(
        `This will update ${totalInstalled} installed template${totalInstalled === 1 ? "" : "s"} to the latest version${totalInstalled === 1 ? "" : "s"} from the configured repositories. Files will be replaced without creating backups. Continue?`,
        "Yes",
        "No"
      );

      if (result !== "Yes") {
        return;
      }

      try {
        const summary = await services.aiTemplateData.updateInstalledTemplates();

        // Build result message
        const messages: string[] = [];

        if (summary.installed > 0) {
          messages.push(`${summary.installed} template${summary.installed === 1 ? "" : "s"} updated`);
        }

        if (summary.skipped > 0) {
          messages.push(`${summary.skipped} skipped (no longer available)`);
        }

        if (summary.failed > 0) {
          messages.push(`${summary.failed} failed`);
        }

        // Show appropriate message based on results
        if (summary.failed > 0) {
          vscode.window.showWarningMessage(`Template update completed with errors: ${messages.join(", ")}.`);
        } else if (summary.installed > 0) {
          vscode.window.showInformationMessage(`Templates updated successfully: ${messages.join(", ")}.`);
        } else {
          vscode.window.showInformationMessage("No templates were updated.");
        }
      } catch (error) {
        console.error("Failed to update templates:", error);
        vscode.window.showErrorMessage(`Failed to update templates: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    services.telemetry
  );
}
