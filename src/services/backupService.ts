import * as fs from "fs";
import * as path from "path";
import { checkFileExists, copyDirectory } from "../helpers/fileSystemHelper";

/**
 * Service for managing directory backups
 */
export class BackupService {
  /**
   * Create backup of existing directory
   */
  public async backupDirectory(sourcePath: string): Promise<string | null> {
    if (!(await checkFileExists(sourcePath))) {
      return null; // Nothing to backup
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${sourcePath}.backup-${timestamp}`;

    await copyDirectory(sourcePath, backupPath);

    return backupPath;
  }

  /**
   * List available backups
   */
  public async listBackups(targetRoot: string, directoryName: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(targetRoot);
      return entries
        .filter((entry) => entry.startsWith(`${directoryName}.backup-`))
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Restore from a specific backup
   */
  public async restoreBackup(targetRoot: string, directoryName: string, backupName: string): Promise<void> {
    const directoryPath = path.join(targetRoot, directoryName);
    const backupPath = path.join(targetRoot, backupName);

    if (!(await checkFileExists(backupPath))) {
      throw new Error(`Backup ${backupName} not found`);
    }

    // Create temp backup of current state
    const tempBackup = `${directoryPath}.temp`;
    if (await checkFileExists(directoryPath)) {
      await copyDirectory(directoryPath, tempBackup);
    }

    try {
      // Remove current directory
      if (await checkFileExists(directoryPath)) {
        await fs.promises.rm(directoryPath, { recursive: true, force: true });
      }

      // Restore from backup
      await copyDirectory(backupPath, directoryPath);

      // Clean up temp backup
      if (await checkFileExists(tempBackup)) {
        await fs.promises.rm(tempBackup, { recursive: true, force: true });
      }
    } catch (error) {
      // Restore temp backup if something went wrong
      if (await checkFileExists(tempBackup)) {
        if (await checkFileExists(directoryPath)) {
          await fs.promises.rm(directoryPath, { recursive: true, force: true });
        }
        await copyDirectory(tempBackup, directoryPath);
        await fs.promises.rm(tempBackup, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  public async cleanupBackups(targetRoot: string, directoryName: string, retentionDays: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const backups = await this.listBackups(targetRoot, directoryName);

    for (const backup of backups) {
      const backupPath = path.join(targetRoot, backup);
      try {
        const stats = await fs.promises.stat(backupPath);
        if (stats.mtime < cutoffDate) {
          await fs.promises.rm(backupPath, { recursive: true, force: true });
          console.log(`Cleaned up old backup: ${backup}`);
        }
      } catch (error) {
        console.error(`Error cleaning up backup ${backup}:`, error);
      }
    }
  }
}
