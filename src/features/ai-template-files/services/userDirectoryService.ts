import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";

/**
 * Template subdirectory names managed by NexKit in the user-level .nexkit folder.
 */
const TEMPLATE_SUBDIRECTORIES = ["agents", "prompts", "skills", "instructions", "chatmodes", "hooks"] as const;

/**
 * Service responsible for managing user-level file storage for NexKit templates.
 * Resolves platform-appropriate paths and ensures the directory structure exists.
 */
export class UserDirectoryService {
  private _cachedRoot: string | undefined;
  private _legacyMigrationAttempted = false;

  /**
   * Returns the platform-appropriate root path for user-level NexKit storage.
   * - Windows: %APPDATA%/NexKit/
   * - macOS: ~/Library/Application Support/NexKit/
   * - Linux: ~/.config/NexKit/
   */
  public getStorageRoot(): string {
    if (this._cachedRoot) {
      return this._cachedRoot;
    }

    const platform = os.platform();
    let root: string;

    if (platform === "win32") {
      const appDataPath = process.env.APPDATA;
      root = appDataPath ? path.join(appDataPath, "NexKit") : path.join(os.homedir(), "AppData", "Roaming", "NexKit");
    } else if (platform === "darwin") {
      root = path.join(os.homedir(), "Library", "Application Support", "NexKit");
    } else {
      root = path.join(os.homedir(), ".config", "NexKit");
    }

    this._cachedRoot = root;
    return this._cachedRoot;
  }

  /**
   * Backward-compatible alias.
   * Returns the global template root used by NexKit.
   */
  public getUserNexkitRoot(): string {
    return this.getGlobalNexkitRoot();
  }

  /**
   * Returns the global template root used by NexKit.
   */
  public getGlobalNexkitRoot(): string {
    return path.join(this.getStorageRoot(), ".global");
  }

  /**
   * Returns the project-specific template root used by NexKit.
   */
  public getProjectNexkitRoot(workspaceRoot?: string): string {
    const projectName = this._resolveProjectFolderName(workspaceRoot);
    return path.join(this.getStorageRoot(), projectName);
  }

  /**
   * Creates NexKit user-level directory structure if it does not exist.
   * Creates:
   * - .global/{agents,prompts,skills,instructions,chatmodes,hooks}
   * - <project>/{agents,prompts,skills,instructions,chatmodes,hooks} when a workspace is available
   */
  public async ensureUserDirectoryStructure(workspaceRoot?: string): Promise<void> {
    await this._migrateLegacyUserDirectoryIfNeeded();

    const globalRoot = this.getGlobalNexkitRoot();
    await this._ensureTemplateSubdirectories(globalRoot);

    const resolvedWorkspaceRoot = workspaceRoot ?? this._tryGetWorkspaceRoot();
    if (resolvedWorkspaceRoot) {
      const projectRoot = this.getProjectNexkitRoot(resolvedWorkspaceRoot);
      await this._ensureTemplateSubdirectories(projectRoot);
    }
  }

  /**
   * Returns a record mapping each template type to its absolute project-specific path.
   */
  public getAbsoluteTemplateLocations(workspaceRoot?: string): Record<string, string> {
    const projectRoot = this.getProjectNexkitRoot(workspaceRoot ?? this._tryGetWorkspaceRoot());
    return this._buildTemplateLocations(projectRoot);
  }

  /**
   * Returns a record mapping each template type to its absolute global path.
   */
  public getAbsoluteGlobalTemplateLocations(): Record<string, string> {
    return this._buildTemplateLocations(this.getGlobalNexkitRoot());
  }

  /**
   * Returns the absolute path for backups.
   * Uses the project scope when a workspace is available, otherwise falls back to global scope.
   */
  public getUserBackupDir(workspaceRoot?: string): string {
    const resolvedWorkspaceRoot = workspaceRoot ?? this._tryGetWorkspaceRoot();
    if (resolvedWorkspaceRoot) {
      return path.join(this.getProjectNexkitRoot(resolvedWorkspaceRoot), "backups");
    }

    return path.join(this.getGlobalNexkitRoot(), "backups");
  }

  /**
   * Returns the legacy user-level .nexkit root path used in previous releases.
   */
  private _getLegacyUserNexkitRoot(): string {
    const platform = os.platform();

    if (platform === "win32") {
      const appDataPath = process.env.APPDATA;
      const base = appDataPath
        ? path.join(appDataPath, "Code", "User")
        : path.join(os.homedir(), "AppData", "Roaming", "Code", "User");
      return path.join(base, ".nexkit");
    }

    if (platform === "darwin") {
      return path.join(os.homedir(), "Library", "Application Support", "Code", "User", ".nexkit");
    }

    return path.join(os.homedir(), ".config", "Code", "User", ".nexkit");
  }

  /**
   * Attempts one-time compatibility migration from legacy user-level path to .global.
   * Existing files in the new location are preserved.
   */
  private async _migrateLegacyUserDirectoryIfNeeded(): Promise<void> {
    if (this._legacyMigrationAttempted) {
      return;
    }
    this._legacyMigrationAttempted = true;

    const legacyRoot = this._getLegacyUserNexkitRoot();
    const targetRoot = this.getGlobalNexkitRoot();

    if (!(await this._pathExists(legacyRoot))) {
      return;
    }

    await fs.promises.mkdir(targetRoot, { recursive: true });

    try {
      await fs.promises.cp(legacyRoot, targetRoot, { recursive: true, force: false, errorOnExist: false });
    } catch {
      // Non-blocking compatibility migration: existing users keep working even if partial copy occurs.
    }
  }

  /**
   * Ensures all managed template subdirectories exist under a root.
   */
  private async _ensureTemplateSubdirectories(root: string): Promise<void> {
    for (const subdir of TEMPLATE_SUBDIRECTORIES) {
      const dirPath = path.join(root, subdir);
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Build locations dictionary for all managed template subdirectories.
   */
  private _buildTemplateLocations(root: string): Record<string, string> {
    const locations: Record<string, string> = {};

    for (const subdir of TEMPLATE_SUBDIRECTORIES) {
      locations[subdir] = path.join(root, subdir);
    }

    return locations;
  }

  /**
   * Resolve active workspace root if available.
   */
  private _tryGetWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  /**
   * Compute a project folder name from a workspace path.
   */
  private _resolveProjectFolderName(workspaceRoot?: string): string {
    const fallbackWorkspace = workspaceRoot ?? this._tryGetWorkspaceRoot();
    const rawName = fallbackWorkspace ? path.basename(path.resolve(fallbackWorkspace)) : "default-project";

    const sanitized = rawName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
    return sanitized.length > 0 ? sanitized : "default-project";
  }

  /**
   * File existence helper.
   */
  private async _pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.promises.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
