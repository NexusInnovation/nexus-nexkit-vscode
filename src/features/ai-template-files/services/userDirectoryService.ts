import * as os from "os";
import * as path from "path";
import * as fs from "fs";

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

  /**
   * Returns the platform-appropriate root path for user-level NexKit storage.
   * - Windows: %APPDATA%/Code/User/.nexkit/
   * - macOS: ~/Library/Application Support/Code/User/.nexkit/
   * - Linux: ~/.config/Code/User/.nexkit/
   */
  public getUserNexkitRoot(): string {
    if (this._cachedRoot) {
      return this._cachedRoot;
    }

    const platform = os.platform();
    let userDir: string;

    if (platform === "win32") {
      userDir = path.join(os.homedir(), "AppData", "Roaming", "Code", "User");
    } else if (platform === "darwin") {
      userDir = path.join(os.homedir(), "Library", "Application Support", "Code", "User");
    } else {
      userDir = path.join(os.homedir(), ".config", "Code", "User");
    }

    this._cachedRoot = path.join(userDir, ".nexkit");
    return this._cachedRoot;
  }

  /**
   * Creates the full user-level .nexkit directory structure if it does not exist.
   * Subdirectories: agents, prompts, skills, instructions, chatmodes, hooks.
   */
  public async ensureUserDirectoryStructure(): Promise<void> {
    const root = this.getUserNexkitRoot();

    for (const subdir of TEMPLATE_SUBDIRECTORIES) {
      const dirPath = path.join(root, subdir);
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Returns a record mapping each template type to its absolute user-level path.
   */
  public getAbsoluteTemplateLocations(): Record<string, string> {
    const root = this.getUserNexkitRoot();
    const locations: Record<string, string> = {};

    for (const subdir of TEMPLATE_SUBDIRECTORIES) {
      locations[subdir] = path.join(root, subdir);
    }

    return locations;
  }

  /**
   * Returns the absolute path for backups within the user-level .nexkit directory.
   */
  public getUserBackupDir(): string {
    return path.join(this.getUserNexkitRoot(), "backups");
  }
}
