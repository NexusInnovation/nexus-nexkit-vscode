import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";

/**
 * Register backup management commands
 */
export function registerRestoreBackupCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    "nexus-nexkit-vscode.restoreBackup",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const backups = await services.backup.listBackups(workspaceFolder.uri.fsPath, ".github");

      if (backups.length === 0) {
        vscode.window.showInformationMessage("No backups available");
        return;
      }

      // Show backup selection
      const selectedBackup = await vscode.window.showQuickPick(
        backups.map((backup) => ({
          label: backup.replace(".github.backup-", ""),
          description: backup,
          detail: `Restore from ${backup}`,
        })),
        {
          placeHolder: "Select a backup to restore",
          title: "Nexkit: Restore Template Backup",
        }
      );

      if (!selectedBackup) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `This will replace your current .github directory with the backup from ${selectedBackup.label}. Continue?`,
        { modal: true },
        "Restore"
      );

      if (confirm !== "Restore") {
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Restoring backup...",
          cancellable: false,
        },
        async (progress) => {
          progress.report({
            increment: 50,
            message: "Restoring templates...",
          });
          await services.backup.restoreBackup(workspaceFolder.uri.fsPath, ".github", selectedBackup.description);

          progress.report({
            increment: 50,
            message: "Backup restored successfully",
          });
        }
      );

      vscode.window.showInformationMessage("Template backup restored successfully!");
    },
    services.telemetry
  );
}

export function registerCleanupBackupCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    "nexus-nexkit-vscode.cleanupBackup",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const backups = await services.backup.listBackups(workspaceFolder.uri.fsPath, ".github");

      if (backups.length === 0) {
        vscode.window.showInformationMessage("No backups available to cleanup");
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `This will permanently delete all ${backups.length} template backup${backups.length > 1 ? "s" : ""}. This action cannot be undone. Continue?`,
        { modal: true },
        "Delete All"
      );

      if (confirm !== "Delete All") {
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Deleting backups...",
          cancellable: false,
        },
        async (progress) => {
          progress.report({
            increment: 50,
            message: "Removing all backups...",
          });
          await services.backup.cleanupBackups(workspaceFolder.uri.fsPath, ".github", 0);

          progress.report({
            increment: 50,
            message: "Cleanup completed",
          });
        }
      );

      vscode.window.showInformationMessage(`Successfully deleted all ${backups.length} backup${backups.length > 1 ? "s" : ""}!`);
    },
    services.telemetry
  );
}
