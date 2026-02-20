import * as fs from "fs";
import * as path from "path";
import { fileExists, copyDirectory } from "../../shared/utils/fileHelper";
import { AI_TEMPLATE_FILE_TYPES } from "../ai-template-files/models/aiTemplateFile";

/**
 * Template folder names in .nexkit directory
 */
const TEMPLATE_FOLDERS = AI_TEMPLATE_FILE_TYPES;

/**
 * Service for managing Nexkit template folder backups
 * Only backs up and manages template folders (agents, prompts, instructions, chatmodes)
 * from the .nexkit directory
 */
export class GitHubTemplateBackupService {
  /**
   * Backup Nexkit template folders and delete them from the workspace
   * @param workspaceRoot Absolute path to workspace root
   * @returns Path to backup directory or null if nothing was backed up
   */
  public async backupTemplates(workspaceRoot: string): Promise<string | null> {
    const githubPath = path.join(workspaceRoot, ".nexkit");

    if (!(await fileExists(githubPath))) {
      return null;
    }

    const hasTemplates = await this.hasAnyTemplateFolders(githubPath);
    if (!hasTemplates) {
      return null;
    }

    // Create backup
    const backupPath = await this.createBackupDirectory(workspaceRoot, githubPath);

    // Delete template folders from original location
    await this.deleteTemplateFolders(workspaceRoot);

    return backupPath;
  }

  /**
   * Delete template folders from .nexkit directory
   * @param workspaceRoot Absolute path to workspace root
   */
  public async deleteTemplateFolders(workspaceRoot: string): Promise<void> {
    const githubPath = path.join(workspaceRoot, ".nexkit");

    if (!(await fileExists(githubPath))) {
      return;
    }

    // Delete only template folders
    for (const folderName of TEMPLATE_FOLDERS) {
      const folderPath = path.join(githubPath, folderName);
      if (await fileExists(folderPath)) {
        await fs.promises.rm(folderPath, { recursive: true, force: true });
      }
    }
  }

  /**
   * List available backups
   * @param workspaceRoot Absolute path to workspace root
   * @returns Array of backup folder names, sorted by date (newest first)
   */
  public async listBackups(workspaceRoot: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(workspaceRoot);
      return entries
        .filter((entry) => entry.startsWith(".nexkit.backup-"))
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Restore template folders from a specific backup
   * @param workspaceRoot Absolute path to workspace root
   * @param backupName Name of the backup folder (e.g., ".github.backup-2024-01-01T12-00-00")
   */
  public async restoreBackup(workspaceRoot: string, backupName: string): Promise<void> {
    const backupPath = path.join(workspaceRoot, backupName);

    if (!(await fileExists(backupPath))) {
      throw new Error(`Backup ${backupName} not found`);
    }

    const githubPath = path.join(workspaceRoot, ".nexkit");

    // Create .nexkit directory if it doesn't exist
    await fs.promises.mkdir(githubPath, { recursive: true });

    // Create temp backup of current template folders
    const tempBackupPath = path.join(workspaceRoot, ".github.temp");
    if (await this.hasAnyTemplateFolders(githubPath)) {
      await fs.promises.mkdir(tempBackupPath, { recursive: true });
      for (const folderName of TEMPLATE_FOLDERS) {
        const sourcePath = path.join(githubPath, folderName);
        if (await fileExists(sourcePath)) {
          const destPath = path.join(tempBackupPath, folderName);
          await copyDirectory(sourcePath, destPath);
        }
      }
    }

    try {
      // Delete current template folders
      await this.deleteTemplateFolders(workspaceRoot);

      // Restore template folders from backup
      for (const folderName of TEMPLATE_FOLDERS) {
        const sourcePath = path.join(backupPath, folderName);
        if (await fileExists(sourcePath)) {
          const destPath = path.join(githubPath, folderName);
          await copyDirectory(sourcePath, destPath);
        }
      }

      // Clean up temp backup
      if (await fileExists(tempBackupPath)) {
        await fs.promises.rm(tempBackupPath, { recursive: true, force: true });
      }
    } catch (error) {
      // Restore temp backup if something went wrong
      if (await fileExists(tempBackupPath)) {
        await this.deleteTemplateFolders(workspaceRoot);
        for (const folderName of TEMPLATE_FOLDERS) {
          const sourcePath = path.join(tempBackupPath, folderName);
          if (await fileExists(sourcePath)) {
            const destPath = path.join(githubPath, folderName);
            await copyDirectory(sourcePath, destPath);
          }
        }
        await fs.promises.rm(tempBackupPath, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * Clean up old backups based on retention policy
   * @param workspaceRoot Absolute path to workspace root
   * @param retentionDays Number of days to keep backups
   */
  public async cleanupBackups(workspaceRoot: string, retentionDays: number = 0): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const backups = await this.listBackups(workspaceRoot);

    for (const backup of backups) {
      const backupPath = path.join(workspaceRoot, backup);
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

  /**
   * Check if any template folders exist in .nexkit directory
   * @param githubPath Absolute path to .nexkit directory
   * @returns True if at least one template folder exists
   */
  private async hasAnyTemplateFolders(githubPath: string): Promise<boolean> {
    for (const folderName of TEMPLATE_FOLDERS) {
      const folderPath = path.join(githubPath, folderName);
      if (await fileExists(folderPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create backup directory with template folders
   * @param workspaceRoot Absolute path to workspace root
   * @param githubPath Absolute path to .nexkit directory
   * @returns Path to backup directory
   */
  private async createBackupDirectory(workspaceRoot: string, githubPath: string): Promise<string> {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/T/g, "_").replace(/:/g, "-");
    const backupPath = path.join(workspaceRoot, `.nexkit.backup-${timestamp}`);
    await fs.promises.mkdir(backupPath, { recursive: true });

    for (const folderName of TEMPLATE_FOLDERS) {
      const sourcePath = path.join(githubPath, folderName);
      if (await fileExists(sourcePath)) {
        const destPath = path.join(backupPath, folderName);
        await copyDirectory(sourcePath, destPath);
      }
    }

    return backupPath;
  }
}
