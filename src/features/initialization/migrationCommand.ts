import * as vscode from "vscode";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { ServiceContainer } from "../../core/serviceContainer";

/**
 * Register the manual migration command.
 * Allows users to trigger workspace-to-user-directory migration on demand.
 */
export function registerMigrateToUserDirectoryCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.MIGRATE_TO_USER_DIRECTORY,
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("No workspace folder open.");
        return;
      }

      const workspaceRoot = workspaceFolder.uri.fsPath;
      const detection = await services.workspaceToUserMigration.detectWorkspaceInstallation(workspaceRoot);

      if (!detection.hasWorkspaceNexkit) {
        vscode.window.showInformationMessage("No workspace .nexkit/ installation found. Nothing to migrate.");
        return;
      }

      const fileCount = Object.values(detection.templateFiles).reduce((sum, files) => sum + files.length, 0);

      const confirm = await vscode.window.showInformationMessage(
        `Found ${fileCount} template file(s) in workspace .nexkit/. Migrate to user directory?`,
        "Migrate",
        "Cancel"
      );

      if (confirm !== "Migrate") {
        return;
      }

      const deleteChoice = await vscode.window.showInformationMessage(
        "Delete workspace .nexkit/ folder after migration? (A backup will be created first.)",
        "Yes, delete",
        "No, keep it"
      );
      const deleteWorkspaceDir = deleteChoice === "Yes, delete";

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Migrating templates to user directory..." },
        async () => {
          try {
            const summary = await services.workspaceToUserMigration.executeMigration(workspaceRoot, deleteWorkspaceDir);

            vscode.window.showInformationMessage(
              `Migration complete: ${summary.copiedCount} file(s) migrated.` +
                (summary.skippedCount > 0 ? ` ${summary.skippedCount} skipped (already existed).` : "")
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Migration failed: ${errorMessage}. Your backup is safe.`);
          }
        }
      );
    },
    services.telemetry
  );
}
