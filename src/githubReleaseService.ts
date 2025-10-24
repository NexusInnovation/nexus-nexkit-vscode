import * as vscode from 'vscode';

export interface ReleaseInfo {
  tagName: string;
  publishedAt: string;
  assets: Array<{
    name: string;
    browserDownloadUrl: string;
    size: number;
  }>;
}

export interface Manifest {
  version: string;
  releaseDate: string;
  changelogUrl: string;
  minExtensionVersion: string;
  templates: { [key: string]: any };
  downloadUrl: string;
}

export class GitHubReleaseService {
  private static readonly REPO_OWNER = 'NexusInnovation';
  private static readonly REPO_NAME = 'nexkit';
  private static readonly BASE_URL = 'https://api.github.com';

  /**
   * Fetch the latest release information from GitHub
   */
  async fetchLatestRelease(): Promise<ReleaseInfo> {
    const url = `${GitHubReleaseService.BASE_URL}/repos/${GitHubReleaseService.REPO_OWNER}/${GitHubReleaseService.REPO_NAME}/releases/latest`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Nexkit-VSCode-Extension',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;

      return {
        tagName: data.tag_name,
        publishedAt: data.published_at,
        assets: data.assets.map((asset: any) => ({
          name: asset.name,
          browserDownloadUrl: asset.browser_download_url,
          size: asset.size
        }))
      };
    } catch (error) {
      throw new Error(`Failed to fetch latest release: ${error}`);
    }
  }

  /**
   * Fetch manifest from a specific release
   */
  async fetchManifest(version: string): Promise<Manifest> {
    const url = `https://raw.githubusercontent.com/${GitHubReleaseService.REPO_OWNER}/${GitHubReleaseService.REPO_NAME}/${version}/manifest.json`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Nexkit-VSCode-Extension'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data as Manifest;
    } catch (error) {
      throw new Error(`Failed to fetch manifest for version ${version}: ${error}`);
    }
  }

  /**
   * Download templates zip file
   */
  async downloadTemplates(version: string): Promise<ArrayBuffer> {
    const release = await this.fetchLatestRelease();
    const templatesAsset = release.assets.find(asset => asset.name === 'templates.zip');

    if (!templatesAsset) {
      throw new Error('Templates zip file not found in latest release');
    }

    try {
      const response = await fetch(templatesAsset.browserDownloadUrl, {
        headers: {
          'User-Agent': 'Nexkit-VSCode-Extension'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download templates: ${response.status} ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      throw new Error(`Failed to download templates: ${error}`);
    }
  }

  /**
   * Check if current extension version meets minimum requirements
   */
  checkExtensionVersion(minVersion: string): boolean {
    const currentVersion = vscode.extensions.getExtension('nexkit-vscode')?.packageJSON?.version || '0.0.0';
    return this.compareVersions(currentVersion, minVersion) >= 0;
  }

  /**
   * Compare two semantic versions
   */
  private compareVersions(version1: string, version2: string): number {
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
}