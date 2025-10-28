import * as vscode from 'vscode';
import { GitHubReleaseService, Manifest } from './githubReleaseService';

export class VersionManager {
  private githubService: GitHubReleaseService;

  constructor(context: vscode.ExtensionContext) {
    this.githubService = new GitHubReleaseService(context);
  }

  /**
   * Get the current template version from workspace settings
   */
  getCurrentVersion(): string {
    const config = vscode.workspace.getConfiguration('nexkit');
    return config.get('templates.version', '0.0.0');
  }

  /**
   * Set the current template version in workspace settings
   */
  async setCurrentVersion(version: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('nexkit');
    await config.update('templates.version', version, vscode.ConfigurationTarget.Workspace);
  }

  /**
   * Check if an update is available
   */
  async isUpdateAvailable(): Promise<{ available: boolean; latestVersion?: string; manifest?: Manifest }> {
    try {
      const release = await this.githubService.fetchLatestRelease();
      const latestVersion = release.tagName.replace(/^v/, ''); // Remove 'v' prefix if present
      const currentVersion = this.getCurrentVersion();

      const isNewer = this.compareVersions(latestVersion, currentVersion) > 0;

      if (isNewer) {
        const manifest = await this.githubService.fetchManifest(release.tagName);
        return { available: true, latestVersion, manifest };
      }

      return { available: false };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { available: false };
    }
  }

  /**
   * Compare two semantic versions
   */
  compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

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
   * Check if automatic updates are enabled and due
   */
  shouldCheckForUpdates(): boolean {
    const config = vscode.workspace.getConfiguration('nexkit');
    const autoCheck = config.get('templates.autoCheckUpdates', true);

    if (!autoCheck) {
      return false;
    }

    const intervalHours = config.get('templates.updateCheckInterval', 24);
    const lastCheck = config.get('templates.lastUpdateCheck', 0) as number;
    const now = Date.now();
    const hoursSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);

    return hoursSinceLastCheck >= intervalHours;
  }

  /**
   * Update the last check timestamp
   */
  async updateLastCheckTimestamp(): Promise<void> {
    const config = vscode.workspace.getConfiguration('nexkit');
    await config.update('templates.lastUpdateCheck', Date.now(), vscode.ConfigurationTarget.Global);
  }
}