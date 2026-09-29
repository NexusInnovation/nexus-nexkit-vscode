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
 * Workspace-relative Squad artifacts backed up before an overwriting init or
 * upgrade (FR-006). Directories are copied recursively; single files are
 * copied with their parent directory preserved.
 */
const SQUAD_ARTIFACTS: readonly string[] = [".squad", path.join(".github", "agents", "squad.agent.md")];

/** Workspace-relative Squad upstream manifest rewritten by `squad upstream`. */
const SQUAD_UPSTREAM_MANIFEST = path.join(".squad", "upstream.json");

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
   * Back up existing Squad artifacts (`.squad/` and
   * `.github/agents/squad.agent.md`) before an overwriting init/upgrade (FR-006).
   *
   * Copies whatever exists into a fresh, timestamped `squad-<ts>` folder in the
   * user backup directory and returns its absolute path. Returns `null` when no
   * Squad artifacts are present (nothing to back up). Retention is intentionally
   * NOT enforced here so a just-created backup cannot be pruned before a caller
   * uses it for rollback; callers may invoke {@link cleanupBackups} afterwards.
   *
   * @param workspaceRoot Absolute path to the workspace root.
   * @returns Absolute path to the created backup directory, or `null`.
   */
  public async backupSquadArtifacts(workspaceRoot: string): Promise<string | null> {
    return this.backupWorkspaceArtifacts(workspaceRoot, SQUAD_ARTIFACTS, "squad");
  }

  /**
   * Back up an explicit set of workspace-relative files/directories into a
   * fresh `<label>-<ts>` folder in the user backup directory (FR-006). Used by
   * flows such as Squad import that overwrite artifacts beyond `.squad/`.
   *
   * Paths that do not exist are skipped. Returns `null` when none exist.
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
   * Restore Squad artifacts from a backup created by
   * {@link backupSquadArtifacts}, used to roll back a failed init.
   *
   * The current `.squad/` and `.github/agents/squad.agent.md` are removed first
   * so the workspace is returned exactly to its backed-up state (artifacts that
   * did not exist at backup time are left absent).
   *
   * @param workspaceRoot Absolute path to the workspace root.
   * @param backupPath Absolute path returned by {@link backupSquadArtifacts}.
   */
  public async restoreSquadArtifacts(workspaceRoot: string, backupPath: string): Promise<void> {
    await this.restoreWorkspaceArtifacts(workspaceRoot, backupPath, SQUAD_ARTIFACTS);
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

  /**
   * Back up `.squad/upstream.json` before a `squad upstream add/sync/remove`
   * rewrites it (FR-031/FR-032). Deliberately narrower than
   * {@link backupSquadArtifacts}: upstream git clones under
   * `.squad/_upstream_repos/` can be large and are re-creatable via sync.
   *
   * @param workspaceRoot Absolute path to the workspace root.
   * @returns Absolute path to the created backup directory, or `null` when no
   *   manifest exists yet (nothing to back up).
   */
  public async backupSquadUpstreamManifest(workspaceRoot: string): Promise<string | null> {
    const manifest = path.join(workspaceRoot, SQUAD_UPSTREAM_MANIFEST);
    if (!(await fileExists(manifest))) {
      return null;
    }

    const timestamp = new Date().toISOString().slice(0, 23).replace(/T/g, "_").replace(/[:.]/g, "-");
    const backupPath = path.join(this._userDirectoryService.getUserBackupDir(), `squad-upstream-${timestamp}`);
    await fs.promises.mkdir(backupPath, { recursive: true });
    await this._copyArtifact(manifest, path.join(backupPath, SQUAD_UPSTREAM_MANIFEST));
    return backupPath;
  }

  /**
   * Restore `.squad/upstream.json` from a backup created by
   * {@link backupSquadUpstreamManifest} (rollback after a failed CLI call).
   *
   * @param workspaceRoot Absolute path to the workspace root.
   * @param backupPath Absolute path returned by {@link backupSquadUpstreamManifest}.
   */
  public async restoreSquadUpstreamManifest(workspaceRoot: string, backupPath: string): Promise<void> {
    const source = path.join(backupPath, SQUAD_UPSTREAM_MANIFEST);
    if (await fileExists(source)) {
      await this._copyArtifact(source, path.join(workspaceRoot, SQUAD_UPSTREAM_MANIFEST));
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
