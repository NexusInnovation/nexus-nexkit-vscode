import * as fs from "fs";
import * as path from "path";
import { fileExists, copyDirectory } from "../../shared/utils/fileHelper";
import { UserDirectoryService } from "../../shared/services/userDirectoryService";

/**
 * Maximum number of backups to retain in user directory
 */
const MAX_BACKUPS = 5;

/**
 * Service for backing up workspace artifacts before destructive operations.
 * Stores backups in the user directory (via UserDirectoryService) instead of the workspace.
 */
export class GitHubTemplateBackupService {
  private readonly _userDirectoryService: UserDirectoryService;

  constructor(userDirectoryService: UserDirectoryService) {
    this._userDirectoryService = userDirectoryService;
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
   * Back up an explicit set of workspace-relative files/directories into a
   * fresh `<label>-<ts>` folder in the user backup directory.
   *
   * Paths that do not exist are skipped. Returns `null` when none exist.
   * Retention is intentionally NOT enforced here so a just-created backup cannot
   * be pruned before a caller uses it for rollback; callers may invoke
   * {@link cleanupBackups} afterwards.
   *
   * @param workspaceRoot Absolute path to the workspace root.
   * @param relativePaths Workspace-relative paths; must stay inside the root.
   * @param label Backup folder prefix (safe single path segment).
   * @throws Error when a path escapes the workspace root or the label is unsafe.
   */
  public async backupWorkspaceArtifacts(
    workspaceRoot: string,
    relativePaths: readonly string[],
    label: string
  ): Promise<string | null> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) {
      throw new Error(`Invalid backup label: ${label}`);
    }

    const present: string[] = [];
    for (const relative of relativePaths) {
      this._assertInsideRoot(workspaceRoot, relative);
      if (await fileExists(path.join(workspaceRoot, relative))) {
        present.push(relative);
      }
    }

    if (present.length === 0) {
      return null;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/T/g, "_").replace(/:/g, "-");
    const backupDir = this._userDirectoryService.getUserBackupDir();
    const backupPath = path.join(backupDir, `${label}-${timestamp}`);
    await fs.promises.mkdir(backupPath, { recursive: true });

    for (const relative of present) {
      await this._copyArtifact(path.join(workspaceRoot, relative), path.join(backupPath, relative));
    }

    return backupPath;
  }

  /**
   * Restore an explicit set of workspace-relative paths from a backup created
   * by {@link backupWorkspaceArtifacts}. Each listed path is removed first, then
   * copied back when present in the backup, so paths that did not exist at
   * backup time end up absent again.
   *
   * @throws Error when a path escapes the workspace root.
   */
  public async restoreWorkspaceArtifacts(
    workspaceRoot: string,
    backupPath: string,
    relativePaths: readonly string[]
  ): Promise<void> {
    for (const relative of relativePaths) {
      this._assertInsideRoot(workspaceRoot, relative);
    }

    for (const relative of relativePaths) {
      const current = path.join(workspaceRoot, relative);
      if (await fileExists(current)) {
        await fs.promises.rm(current, { recursive: true, force: true });
      }
    }

    for (const relative of relativePaths) {
      const source = path.join(backupPath, relative);
      if (await fileExists(source)) {
        await this._copyArtifact(source, path.join(workspaceRoot, relative));
      }
    }
  }

  private _assertInsideRoot(workspaceRoot: string, relative: string): void {
    const resolved = path.resolve(workspaceRoot, relative);
    const fromRoot = path.relative(path.resolve(workspaceRoot), resolved);
    if (
      relative.length === 0 ||
      path.isAbsolute(relative) ||
      fromRoot === "" ||
      fromRoot === ".." ||
      fromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(fromRoot)
    ) {
      throw new Error(`Backup path escapes the workspace root: ${relative}`);
    }
  }

  /** Copy a file or directory, creating the destination's parent directory. */
  private async _copyArtifact(source: string, destination: string): Promise<void> {
    const stats = await fs.promises.stat(source);
    if (!stats.isDirectory()) {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    }
    await copyDirectory(source, destination);
  }
}
