import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

/**
 * Register backup management commands
 */
export function registerRestoreBackupCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.RESTORE_BACKUP,
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const backups = await services.backup.listBackups(workspaceFolder.uri.fsPath);

      if (backups.length === 0) {
        vscode.window.showInformationMessage("No backups available");
        return;
      }

      // Show backup selection
      const selectedBackup = await vscode.window.showQuickPick(
        backups.map((backup) => ({
          label: backup.replace(".github.backup-", ""),
          description: backup,
          detail: `Restore template folders from ${backup}`,
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
        `This will replace your current template folders (agents, prompts, instructions, chatmodes) with the backup from ${selectedBackup.label}. Continue?`,
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
        async () => {
          await services.backup.restoreBackup(workspaceFolder.uri.fsPath, selectedBackup.description);
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
    Commands.CLEANUP_BACKUP,
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const backups = await services.backup.listBackups(workspaceFolder.uri.fsPath);

      if (backups.length === 0) {
        vscode.window.showInformationMessage("No backups available to cleanup");
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `This will permanently delete all ${backups.length} template backup${backups.length > 1 ? "s" : ""}. This action cannot be undone. Continue?`,
        "Delete All"
      );

      if (confirm !== "Delete All") {
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Removing all backups...",
          cancellable: false,
        },
        async (progress) => {
          await services.backup.cleanupBackups(workspaceFolder.uri.fsPath, 0);
        }
      );

      vscode.window.showInformationMessage(`Successfully deleted all ${backups.length} backup${backups.length > 1 ? "s" : ""}!`);
    },
    services.telemetry
  );
}
