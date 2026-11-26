import * as os from "os";
import * as path from "path";

/**
 * Resolves platform-appropriate paths for user-level NexKit storage (e.g. backups).
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
   * Returns the absolute path for backups within the user-level .nexkit directory.
   */
  public getUserBackupDir(): string {
    return path.join(this.getUserNexkitRoot(), "backups");
  }
}
