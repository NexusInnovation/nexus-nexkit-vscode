/**
 * VS Code Profile Helper
 * Utilities for locating and copying VS Code user profile data
 * Used to copy GitHub authentication from user's VS Code to test instances
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export class VSCodeProfileHelper {
  /**
   * Get the VS Code user data directory path based on platform and variant
   * @param variant VS Code variant: 'code' (stable), 'code-insiders', or 'code-oss'
   */
  public static getUserDataDir(variant: "code" | "code-insiders" | "code-oss" = "code"): string | null {
    const platform = process.platform;
    const homeDir = os.homedir();

    const variantName =
      variant === "code-insiders" ? "Code - Insiders" : variant === "code-oss" ? "Code - OSS" : "Code";

    let userDataDir: string;

    switch (platform) {
      case "win32":
        // Windows: %APPDATA%\Code or %APPDATA%\Code - Insiders
        userDataDir = path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), variantName);
        break;

      case "darwin":
        // macOS: ~/Library/Application Support/Code
        userDataDir = path.join(homeDir, "Library", "Application Support", variantName);
        break;

      case "linux":
        // Linux: ~/.config/Code
        userDataDir = path.join(homeDir, ".config", variantName);
        break;

      default:
        console.warn(`Unsupported platform: ${platform}`);
        return null;
    }

    return fs.existsSync(userDataDir) ? userDataDir : null;
  }

  /**
   * Find the first available VS Code user data directory
   * Tries stable, then insiders, then OSS
   */
  public static findUserDataDir(): string | null {
    const variants: Array<"code" | "code-insiders" | "code-oss"> = ["code", "code-insiders", "code-oss"];

    for (const variant of variants) {
      const dir = this.getUserDataDir(variant);
      if (dir) {
        return dir;
      }
    }

    return null;
  }

  /**
   * Get the GitHub authentication storage directory
   */
  public static getGitHubAuthStorageDir(userDataDir: string): string {
    return path.join(userDataDir, "User", "globalStorage", "vscode.github-authentication");
  }

  /**
   * Check if GitHub authentication data exists in user profile
   */
  public static hasGitHubAuth(): boolean {
    const userDataDir = this.findUserDataDir();
    if (!userDataDir) {
      return false;
    }

    const authDir = this.getGitHubAuthStorageDir(userDataDir);
    return fs.existsSync(authDir);
  }

  /**
   * Copy GitHub authentication from user profile to target directory
   * @param targetUserDataDir Target user data directory (e.g., test instance)
   * @returns true if copied successfully, false otherwise
   */
  public static copyGitHubAuthToTest(targetUserDataDir: string): boolean {
    try {
      // Find source authentication directory
      const sourceUserDataDir = this.findUserDataDir();
      if (!sourceUserDataDir) {
        console.log("ℹ️  No VS Code user data directory found. Tests will run without GitHub authentication.");
        return false;
      }

      const sourceAuthDir = this.getGitHubAuthStorageDir(sourceUserDataDir);
      if (!fs.existsSync(sourceAuthDir)) {
        console.log("ℹ️  No GitHub authentication found in VS Code profile. Tests will run without authentication.");
        return false;
      }

      // Create target authentication directory
      const targetAuthDir = this.getGitHubAuthStorageDir(targetUserDataDir);
      fs.mkdirSync(path.dirname(targetAuthDir), { recursive: true });

      // Copy authentication data
      fs.cpSync(sourceAuthDir, targetAuthDir, { recursive: true });

      console.log(`✅ Copied GitHub authentication from VS Code profile to test instance`);
      console.log(`   Source: ${sourceAuthDir}`);
      console.log(`   Target: ${targetAuthDir}`);

      return true;
    } catch (error) {
      console.warn("⚠️  Failed to copy GitHub authentication:", error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Get information about available VS Code installations
   */
  public static getVSCodeInfo(): {
    stable: boolean;
    insiders: boolean;
    oss: boolean;
    activeVariant: string | null;
    hasGitHubAuth: boolean;
  } {
    const stable = this.getUserDataDir("code") !== null;
    const insiders = this.getUserDataDir("code-insiders") !== null;
    const oss = this.getUserDataDir("code-oss") !== null;

    let activeVariant: string | null = null;
    if (stable) {
      activeVariant = "stable";
    } else if (insiders) {
      activeVariant = "insiders";
    } else if (oss) {
      activeVariant = "oss";
    }

    return {
      stable,
      insiders,
      oss,
      activeVariant,
      hasGitHubAuth: this.hasGitHubAuth(),
    };
  }
}
