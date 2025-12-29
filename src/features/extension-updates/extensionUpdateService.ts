import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { promisify } from "util";
import { exec } from "child_process";
import { getExtensionVersion } from "../../shared/utils/extensionHelper";
import { ExtensionGitHubReleaseService, GitHubReleaseInfo } from "./extensionGitHubReleaseService";
import { SettingsManager } from "../../core/settingsManager";

export interface ExtensionUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  releaseInfo: GitHubReleaseInfo;
  vsixPath?: string;
}

export class ExtensionUpdateService {
  private extensionReleaseService = new ExtensionGitHubReleaseService();

  /**
   * Checks if an extension update is available by comparing the current version with the latest release.
   */
  public async checkForExtensionUpdate(): Promise<ExtensionUpdateInfo | null> {
    try {
      const currentVersion = getExtensionVersion() || "0.0.0";
      const release = await this.extensionReleaseService.fetchLatestRelease();
      const latestVersion = release.tagName.replace(/^v/, "");

      const isNewer = this.compareVersions(latestVersion, currentVersion) > 0;

      // Update timestamp after check
      await SettingsManager.setLastUpdateCheck(Date.now());

      if (isNewer) {
        return {
          currentVersion,
          latestVersion,
          releaseInfo: release,
        };
      }

      return null;
    } catch (error) {
      // Treat "no releases" as a normal "no update" condition to avoid
      // noisy errors when the extension hasn't published any releases yet
      // or the repository is not exposing releases.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("No releases")) {
        console.log("[Nexkit] No extension releases available yet");
        return null;
      }

      console.error("Error checking for extension updates:", error);
      return null;
    }
  }

  /**
   * Prompt user with update options
   * @param updateInfo Update information
   */
  public async promptUserForUpdate(updateInfo: ExtensionUpdateInfo): Promise<void> {
    const message = `Nexkit extension ${updateInfo.latestVersion} is available! (current: ${updateInfo.currentVersion})`;

    const result = await vscode.window.showInformationMessage(
      message,
      { modal: false },
      "Install & Reload",
      "Copy Install Command",
      "View Release Notes",
      "Later"
    );

    if (!result || result === "Later") {
      return;
    }

    if (result === "View Release Notes") {
      // Open GitHub release page
      const releaseUrl = `https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/tag/${updateInfo.releaseInfo.tagName}`;
      await vscode.env.openExternal(vscode.Uri.parse(releaseUrl));
      return;
    }

    // Download .vsix file
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Downloading extension update...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          increment: 30,
          message: "Downloading .vsix file...",
        });
        const vsixPath = await this.downloadExtensionVsix(updateInfo);

        progress.report({
          increment: 40,
          message: "Preparing installation...",
        });

        if (result === "Install & Reload") {
          progress.report({
            increment: 30,
            message: "Installing extension...",
          });
          await this.installExtension(vsixPath);
        } else if (result === "Copy Install Command") {
          await vscode.env.clipboard.writeText(this.getInstallCommand(vsixPath));

          vscode.window
            .showInformationMessage(
              `Install command copied to clipboard! Extension downloaded to: ${vsixPath}`,
              "Open File Location",
              "Install Now"
            )
            .then(async (selection) => {
              if (selection === "Open File Location") {
                await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(vsixPath));
              } else if (selection === "Install Now") {
                await this.installExtension(vsixPath);
              }
            });
        }
      }
    );
  }

  /**
   * Check for extension updates on activation and prompt user if available
   */
  public async checkForExtensionUpdatesOnActivation(): Promise<void> {
    try {
      if (this.shouldCheckForExtensionUpdates()) {
        const updateInfo = await this.checkForExtensionUpdate();

        if (updateInfo) {
          await this.promptUserForUpdate(updateInfo);
        }
      }
    } catch (error) {
      // Only log errors that aren't "no releases" errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("No releases")) {
        console.error("Error checking for extension updates:", error);
      } else {
        console.log("[Nexkit] No releases available yet");
      }
    }
  }

  /**
   * Clean up old .vsix files from temp directory on activation
   */
  public async cleanupOldVsixFilesOnActivation(): Promise<void> {
    try {
      const tempDir = os.tmpdir();
      const files = await fs.promises.readdir(tempDir);

      const vsixFiles = files.filter((f) => f.startsWith("nexkit-vscode-") && f.endsWith(".vsix"));

      // Keep only the 2 most recent files
      if (vsixFiles.length > 2) {
        const filesToDelete = vsixFiles.slice(0, vsixFiles.length - 2);
        for (const file of filesToDelete) {
          try {
            await fs.promises.unlink(path.join(tempDir, file));
            console.log(`Cleaned up old .vsix file: ${file}`);
          } catch {
            // Ignore errors when deleting old files
          }
        }
      }
    } catch (error) {
      console.error("Error cleaning up old .vsix files:", error);
    }
  }

  /**
   * Download extension .vsix file from GitHub release
   * @param updateInfo Update information including release data
   * @returns Path to downloaded .vsix file
   */
  private async downloadExtensionVsix(updateInfo: ExtensionUpdateInfo): Promise<string> {
    try {
      const vsixAsset = updateInfo.releaseInfo.assets.find((asset) => asset.name.endsWith(".vsix"));

      if (!vsixAsset) {
        throw new Error("No .vsix file found in release assets");
      }

      // Download .vsix file
      const vsixBuffer = await this.extensionReleaseService.downloadVsixAsset(updateInfo.releaseInfo);

      // Save to temp directory
      const tempDir = os.tmpdir();
      const vsixFileName = `nexkit-vscode-${updateInfo.latestVersion}.vsix`;
      const vsixPath = path.join(tempDir, vsixFileName);

      // Write to file
      await fs.promises.writeFile(vsixPath, Buffer.from(vsixBuffer));

      console.log(`Extension .vsix downloaded to: ${vsixPath}`);
      return vsixPath;
    } catch (error) {
      throw new Error(`Failed to download extension .vsix: ${error}`);
    }
  }

  /**
   * Install extension from .vsix file using VS Code CLI
   * @param vsixPath Path to the .vsix file
   */
  private async installExtension(vsixPath: string): Promise<void> {
    const execAsync = promisify(exec);

    try {
      // Execute the install command and wait for completion
      const { stdout, stderr } = await execAsync(this.getInstallCommand(vsixPath), {
        timeout: 60000, // 60 second timeout
      });

      // Log output for debugging
      if (stdout) {
        console.log("Extension installation output:", stdout);
      }
      if (stderr) {
        console.warn("Extension installation warnings:", stderr);
      }

      // Prompt to reload
      const result = await vscode.window.showInformationMessage(
        "Extension installed successfully! Please reload VS Code to complete the update.",
        "Reload Now",
        "Later"
      );

      if (result === "Reload Now") {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to install extension: ${errorMessage}`);
    }
  }

  /**
   * Get the appropriate VS Code command for installing extension
   */
  private getInstallCommand(vsixPath: string): string {
    // Check if using VS Code Insiders
    const isInsiders = vscode.env.appName.includes("Insiders");
    const codeCommand = isInsiders ? "code-insiders" : "code";
    return `${codeCommand} --install-extension "${vsixPath}"`;
  }

  /**
   * Compare two semantic versions
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split(".").map(Number);
    const v2Parts = version2.split(".").map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) {
        return 1;
      }
      if (v1Part < v2Part) {
        return -1;
      }
    }

    return 0;
  }

  /**
   * Check if automatic update checks are enabled
   */
  private shouldCheckForExtensionUpdates(): boolean {
    const autoCheck = SettingsManager.isAutoCheckUpdatesEnabled();

    if (!autoCheck) {
      return false;
    }

    const intervalHours = SettingsManager.getUpdateCheckIntervalHours();
    const lastCheck = SettingsManager.getLastUpdateCheck();
    const now = Date.now();
    const hoursSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);

    return hoursSinceLastCheck >= intervalHours;
  }
}
