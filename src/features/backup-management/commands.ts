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
      services.logging.info("Restoring template backup...");

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        services.logging.warn("Backup restore failed: No workspace folder open");
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const backups = await services.backup.listBackups(workspaceFolder.uri.fsPath);

      if (backups.length === 0) {
        services.logging.info("No backups available to restore");
        vscode.window.showInformationMessage("No backups available");
        return;
      }

      services.logging.info(`Found ${backups.length} backup(s) available`);

      // Show backup selection
      const selectedBackup = await vscode.window.showQuickPick(
        backups.map((backup) => ({
          label: backup.replace(".nexkit.backup-", ""),
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
        services.logging.info("Backup restore cancelled by user");
        return;
      }

      services.logging.info(`Restoring backup: ${selectedBackup.description}`);
      await services.backup.restoreBackup(workspaceFolder.uri.fsPath, selectedBackup.description);
      services.logging.info("Template backup restored successfully");

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
      services.logging.info("Cleaning up template backups...");

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        services.logging.warn("Backup cleanup failed: No workspace folder open");
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const backups = await services.backup.listBackups(workspaceFolder.uri.fsPath);

      if (backups.length === 0) {
        services.logging.info("No backups available to cleanup");
        vscode.window.showInformationMessage("No backups available to cleanup");
        return;
      }

      services.logging.info(`Found ${backups.length} backup(s) to cleanup`);

      const confirm = await vscode.window.showWarningMessage(
        `This will permanently delete all ${backups.length} template backup${backups.length > 1 ? "s" : ""}. This action cannot be undone. Continue?`,
        "Delete All"
      );

      if (confirm !== "Delete All") {
        services.logging.info("Backup cleanup cancelled by user");
        return;
      }

      services.logging.info(`Deleting ${backups.length} backup(s)...`);
      await services.backup.cleanupBackups(workspaceFolder.uri.fsPath);
      services.logging.info(`Successfully deleted ${backups.length} backup(s)`);

      vscode.window.showInformationMessage(`Successfully deleted all ${backups.length} backup${backups.length > 1 ? "s" : ""}!`);
    },
    services.telemetry
  );
}
