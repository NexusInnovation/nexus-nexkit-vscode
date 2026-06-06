import * as fs from "fs";
import * as path from "path";
import { fileExists, copyDirectory } from "../../shared/utils/fileHelper";
import { AI_TEMPLATE_FILE_TYPES } from "../ai-template-files/models/aiTemplateFile";
import { UserDirectoryService } from "../ai-template-files/services/userDirectoryService";
import { NexkitFileWatcherService } from "../nexkit-file-watcher/nexkitFileWatcherService";

/**
 * Template folder names in .nexkit directory
 */
const TEMPLATE_FOLDERS = AI_TEMPLATE_FILE_TYPES;

/**
 * Maximum number of backups to retain in user directory
 */
const MAX_BACKUPS = 5;

/**
 * Service for managing Nexkit template folder backups.
 * Stores backups in the user directory (via UserDirectoryService) instead of the workspace.
 */
export class GitHubTemplateBackupService {
  private readonly _userDirectoryService: UserDirectoryService;

  constructor(userDirectoryService: UserDirectoryService) {
    this._userDirectoryService = userDirectoryService;
  }

  /**
   * Backup Nexkit template folders and delete them from the workspace.
   * Backups are stored in the user directory under backups/<timestamp>/.
   * Automatically enforces retention policy (keeps last 5 backups).
   * @param workspaceRoot Absolute path to workspace root
   * @returns Path to backup directory or null if nothing was backed up
   */
  public async backupTemplates(workspaceRoot: string): Promise<string | null> {
    const nexkitPath = path.join(workspaceRoot, ".nexkit");

    if (!(await fileExists(nexkitPath))) {
      return null;
    }

    const hasTemplates = await this._hasAnyTemplateFolders(nexkitPath);
    if (!hasTemplates) {
      return null;
    }

    // Create backup in user directory
    const backupPath = await this._createBackupDirectory(nexkitPath);

    // Delete template folders from original location
    await this.deleteTemplateFolders(workspaceRoot);

    // Enforce retention policy
    await this._enforceRetentionPolicy();

    return backupPath;
  }

  /**
   * Delete template folders from .nexkit directory
   * @param workspaceRoot Absolute path to workspace root
   */
  public async deleteTemplateFolders(workspaceRoot: string): Promise<void> {
    const nexkitPath = path.join(workspaceRoot, ".nexkit");

    if (!(await fileExists(nexkitPath))) {
      return;
    }

    const watcher = NexkitFileWatcherService.getInstance();
    watcher.beginBulkOperation();
    try {
      for (const folderName of TEMPLATE_FOLDERS) {
        const folderPath = path.join(nexkitPath, folderName);
        if (await fileExists(folderPath)) {
          await fs.promises.rm(folderPath, { recursive: true, force: true });
        }
      }
    } finally {
      await watcher.endBulkOperation();
    }
  }

  /**
   * List available backups from user directory
   * @returns Array of backup folder names (timestamps), sorted newest first
   */
  public async listBackups(): Promise<string[]> {
    const backupDir = this._userDirectoryService.getUserBackupDir();
    try {
      await fs.promises.mkdir(backupDir, { recursive: true });
      const entries = await fs.promises.readdir(backupDir);
      const dirs: string[] = [];
      for (const entry of entries) {
        const entryPath = path.join(backupDir, entry);
        const stat = await fs.promises.stat(entryPath);
        if (stat.isDirectory()) {
          dirs.push(entry);
        }
      }
      return dirs.sort().reverse();
    } catch {
      return [];
    }
  }

  /**
   * Restore template folders from a specific backup in user directory
   * @param workspaceRoot Absolute path to workspace root
   * @param backupName Name of the backup folder (timestamp, e.g., "2024-01-01_12-00-00")
   */
  public async restoreBackup(workspaceRoot: string, backupName: string): Promise<void> {
    const backupDir = this._userDirectoryService.getUserBackupDir();
    const backupPath = path.join(backupDir, backupName);

    if (!(await fileExists(backupPath))) {
      throw new Error(`Backup ${backupName} not found`);
    }

    const nexkitPath = path.join(workspaceRoot, ".nexkit");

    // Create .nexkit directory if it doesn't exist
    await fs.promises.mkdir(nexkitPath, { recursive: true });

    // Create temp backup of current template folders for rollback
    const tempBackupPath = path.join(backupDir, ".restore-temp");
    if (await this._hasAnyTemplateFolders(nexkitPath)) {
      await fs.promises.mkdir(tempBackupPath, { recursive: true });
      for (const folderName of TEMPLATE_FOLDERS) {
        const sourcePath = path.join(nexkitPath, folderName);
        if (await fileExists(sourcePath)) {
          const destPath = path.join(tempBackupPath, folderName);
          await copyDirectory(sourcePath, destPath);
        }
      }
    }

    const watcher = NexkitFileWatcherService.getInstance();
    watcher.beginBulkOperation();
    try {
      // Delete current template folders
      await this.deleteTemplateFolders(workspaceRoot);

      // Restore template folders from backup
      for (const folderName of TEMPLATE_FOLDERS) {
        const sourcePath = path.join(backupPath, folderName);
        if (await fileExists(sourcePath)) {
          const destPath = path.join(nexkitPath, folderName);
          await copyDirectory(sourcePath, destPath);
        }
      }

      // Clean up temp backup on success
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
            const destPath = path.join(nexkitPath, folderName);
            await copyDirectory(sourcePath, destPath);
          }
        }
        await fs.promises.rm(tempBackupPath, { recursive: true, force: true });
      }
      throw error;
    } finally {
      await watcher.endBulkOperation();
    }
  }

  /**
   * Clean up old backups, keeping only the most recent N (default: MAX_BACKUPS).
   * @param maxToKeep Maximum number of backups to retain
   */
  public async cleanupBackups(maxToKeep: number = MAX_BACKUPS): Promise<void> {
    const backups = await this.listBackups();

    if (backups.length <= maxToKeep) {
      return;
    }

    const toDelete = backups.slice(maxToKeep);
    const backupDir = this._userDirectoryService.getUserBackupDir();

    for (const backup of toDelete) {
      const backupPath = path.join(backupDir, backup);
      try {
        await fs.promises.rm(backupPath, { recursive: true, force: true });
      } catch (error) {
        console.error(`Error cleaning up backup ${backup}:`, error);
      }
    }
  }

  /**
   * Check if any template folders exist in .nexkit directory
   */
  private async _hasAnyTemplateFolders(nexkitPath: string): Promise<boolean> {
    for (const folderName of TEMPLATE_FOLDERS) {
      const folderPath = path.join(nexkitPath, folderName);
      if (await fileExists(folderPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create backup directory with template folders in user directory
   * @param nexkitPath Absolute path to .nexkit directory in workspace
   * @returns Absolute path to the created backup directory
   */
  private async _createBackupDirectory(nexkitPath: string): Promise<string> {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/T/g, "_").replace(/:/g, "-");
    const backupDir = this._userDirectoryService.getUserBackupDir();
    const backupPath = path.join(backupDir, timestamp);
    await fs.promises.mkdir(backupPath, { recursive: true });

    for (const folderName of TEMPLATE_FOLDERS) {
      const sourcePath = path.join(nexkitPath, folderName);
      if (await fileExists(sourcePath)) {
        const destPath = path.join(backupPath, folderName);
        await copyDirectory(sourcePath, destPath);
      }
    }

    return backupPath;
  }

  /**
   * Enforce retention policy by removing oldest backups beyond MAX_BACKUPS
   */
  private async _enforceRetentionPolicy(): Promise<void> {
    await this.cleanupBackups(MAX_BACKUPS);
  }
}
