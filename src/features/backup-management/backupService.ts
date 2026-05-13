import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { fileExists, copyDirectory, getNexkitUserDirectory } from "../../shared/utils/fileHelper";
import { AI_TEMPLATE_FILE_TYPES } from "../ai-template-files/models/aiTemplateFile";
import { NexkitFileWatcherService } from "../nexkit-file-watcher/nexkitFileWatcherService";
import { UserDirectoryService } from "../ai-template-files/services/userDirectoryService";

/**
 * Template folder names in .nexkit directory
 */
const TEMPLATE_FOLDERS = AI_TEMPLATE_FILE_TYPES;
const MAX_BACKUPS = 5;

/**
 * Service for managing Nexkit template folder backups
 * Only backs up and manages template folders (agents, prompts, instructions, chatmodes)
 * from the .nexkit directory
 */
export class GitHubTemplateBackupService {
  constructor(private readonly _userDirectoryService: UserDirectoryService = new UserDirectoryService()) {}

  /**
   * Backup Nexkit template folders and delete them from the workspace
   * @param workspaceRoot Absolute path to workspace root
   * @returns Path to backup directory or null if nothing was backed up
   */
  public async backupTemplates(workspaceRoot: string): Promise<string | null> {
    const nexkitPath = getNexkitUserDirectory(vscode.env.appName);

    if (!(await fileExists(nexkitPath))) {
      return null;
    }

    const hasTemplates = await this.hasAnyTemplateFolders(nexkitPath);
    if (!hasTemplates) {
      return null;
    }

    // Create backup
    const backupPath = await this.createBackupDirectory(workspaceRoot, nexkitPath);

    // Delete template folders from original location
    await this.deleteTemplateFolders(workspaceRoot);

    // Enforce retention policy
    await this._enforceRetentionPolicy(workspaceRoot);

    return backupPath;
  }

  /**
   * Delete template folders from .nexkit directory
   * @param workspaceRoot Absolute path to workspace root
   */
  public async deleteTemplateFolders(workspaceRoot: string): Promise<void> {
    const nexkitPath = getNexkitUserDirectory(vscode.env.appName);

    if (!(await fileExists(nexkitPath))) {
      return;
    }

    const watcher = NexkitFileWatcherService.getInstance();
    watcher.beginBulkOperation();
    try {
      // Delete only template folders
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
   * List available backups
   * @returns Array of backup folder names, sorted by date (newest first)
   */
  public async listBackups(workspaceRoot?: string): Promise<string[]> {
    const backupDir = this._userDirectoryService.getUserBackupDir(workspaceRoot);
    try {
      const entries = await fs.promises.readdir(backupDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Restore template folders from a specific backup
   * @param workspaceRoot Absolute path to workspace root
   * @param backupName Name of the backup folder (timestamp, e.g., "2024-01-01_12-00-00")
   */
  public async restoreBackup(workspaceRoot: string, backupName: string): Promise<void> {
    const backupDir = this._userDirectoryService.getUserBackupDir(workspaceRoot);
    const backupPath = path.join(backupDir, backupName);

    if (!(await fileExists(backupPath))) {
      throw new Error(`Backup ${backupName} not found`);
    }

    const nexkitRoot = getNexkitUserDirectory(vscode.env.appName);
    const nexkitPath = nexkitRoot;

    // Create .nexkit directory if it doesn't exist
    await fs.promises.mkdir(nexkitPath, { recursive: true });

    // Create temp backup of current template folders
    const tempBackupPath = path.join(nexkitRoot, ".temp-backup");
    if (await this.hasAnyTemplateFolders(nexkitPath)) {
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
   * Clean up old backups by count (keeps newest backups)
   */
  public async cleanupBackups(maxToKeep: number = MAX_BACKUPS, workspaceRoot?: string): Promise<void> {
    const backups = await this.listBackups(workspaceRoot);
    const toDelete = backups.slice(maxToKeep);
    const backupDir = this._userDirectoryService.getUserBackupDir(workspaceRoot);

    for (const backup of toDelete) {
      const backupPath = path.join(backupDir, backup);
      try {
        await fs.promises.rm(backupPath, { recursive: true, force: true });
        console.log(`Cleaned up old backup: ${backup}`);
      } catch (error) {
        console.error(`Error cleaning up backup ${backup}:`, error);
      }
    }
  }

  /**
   * Check if any template folders exist in .nexkit directory
   * @param nexkitPath Absolute path to .nexkit directory
   * @returns True if at least one template folder exists
   */
  private async hasAnyTemplateFolders(nexkitPath: string): Promise<boolean> {
    for (const folderName of TEMPLATE_FOLDERS) {
      const folderPath = path.join(nexkitPath, folderName);
      if (await fileExists(folderPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create backup directory with template folders
   * @param workspaceRoot Workspace root used to resolve backup scope
   * @param nexkitPath Absolute path to .nexkit directory
   * @returns Path to backup directory
   */
  private async createBackupDirectory(workspaceRoot: string, nexkitPath: string): Promise<string> {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/T/g, "_").replace(/:/g, "-");
    const backupDir = this._userDirectoryService.getUserBackupDir(workspaceRoot);
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
  private async _enforceRetentionPolicy(workspaceRoot: string): Promise<void> {
    await this.cleanupBackups(MAX_BACKUPS, workspaceRoot);
  }
}
