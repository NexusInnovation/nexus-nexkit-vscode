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
  private static readonly REPO_NAME = 'nexkit-vscode';
  private static readonly BASE_URL = 'https://api.github.com';
  private static readonly GITHUB_AUTH_PROVIDER_ID = 'github';
  private static readonly REQUIRED_SCOPES = ['repo'];

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Get GitHub authentication session with required scopes
   * @param createIfNone If true, prompt user to sign in if not authenticated
   */
  private async getGitHubSession(createIfNone: boolean = false): Promise<vscode.AuthenticationSession | undefined> {
    try {
      const session = await vscode.authentication.getSession(
        GitHubReleaseService.GITHUB_AUTH_PROVIDER_ID,
        GitHubReleaseService.REQUIRED_SCOPES,
        { createIfNone, silent: !createIfNone }
      );
      return session;
    } catch (error) {
      console.error('Failed to get GitHub authentication session:', error);
      return undefined;
    }
  }

  /**
   * Get authentication headers for GitHub API requests
   * @param requireAuth If true, will prompt for authentication if not already authenticated
   */
  private async getAuthHeaders(requireAuth: boolean = true): Promise<Record<string, string>> {
    const session = await this.getGitHubSession(requireAuth);
    const headers: Record<string, string> = {
      'User-Agent': 'Nexkit-VSCode-Extension',
      'Accept': 'application/vnd.github.v3+json'
    };

    if (session) {
      headers['Authorization'] = `Bearer ${session.accessToken}`;
    }

    return headers;
  }

  /**
   * Handle authentication errors and prompt user to sign in
   * GitHub returns 404 for private repos when not authenticated (security feature)
   */
  private async handleAuthError(response: Response): Promise<boolean> {
    // GitHub returns 404 for private repositories when not authenticated
    // This is a security feature to not reveal the existence of private repos
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      const message = response.status === 404
        ? 'Repository not found. This may be a private repository. Please sign in to GitHub.'
        : response.status === 401 
          ? 'GitHub authentication required to access private repositories.'
          : 'GitHub API rate limit exceeded or insufficient permissions.';
      
      const signIn = 'Sign In to GitHub';
      const result = await vscode.window.showErrorMessage(message, signIn, 'Cancel');
      
      if (result === signIn) {
        const session = await this.getGitHubSession(true);
        return session !== undefined;
      }
    }
    return false;
  }

  /**
   * Fetch the latest release information from GitHub
   */
  async fetchLatestRelease(): Promise<ReleaseInfo> {
    const url = `${GitHubReleaseService.BASE_URL}/repos/${GitHubReleaseService.REPO_OWNER}/${GitHubReleaseService.REPO_NAME}/releases/latest`;

    try {
      // First attempt: Try with existing session silently
      let headers = await this.getAuthHeaders(false);
      let response = await fetch(url, { headers });

      // If we get 404, 401, or 403, it might be a private repo - try to authenticate and retry
      if (!response.ok && (response.status === 404 || response.status === 401 || response.status === 403)) {
        const authenticated = await this.handleAuthError(response);
        
        if (authenticated) {
          // Retry with new authentication
          headers = await this.getAuthHeaders(false); // Don't prompt again, we just authenticated
          response = await fetch(url, { headers });
        }
      }

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
      // First attempt with existing session silently
      let headers = await this.getAuthHeaders(false);
      let response = await fetch(url, { headers });

      // Retry if authentication issue detected
      if (!response.ok && (response.status === 404 || response.status === 401 || response.status === 403)) {
        const authenticated = await this.handleAuthError(response);
        
        if (authenticated) {
          headers = await this.getAuthHeaders(false);
          response = await fetch(url, { headers });
        }
      }

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
      // First attempt with existing session silently
      let headers = await this.getAuthHeaders(false);
      let response = await fetch(templatesAsset.browserDownloadUrl, { headers });

      // Retry if authentication issue detected
      if (!response.ok && (response.status === 404 || response.status === 401 || response.status === 403)) {
        const authenticated = await this.handleAuthError(response);
        
        if (authenticated) {
          headers = await this.getAuthHeaders(false);
          response = await fetch(templatesAsset.browserDownloadUrl, { headers });
        }
      }

      if (!response.ok) {
        throw new Error(`Failed to download templates: ${response.status} ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      throw new Error(`Failed to download templates: ${error}`);
    }
  }

  /**
   * Download .vsix file from release assets
   */
  async downloadVsixAsset(release: ReleaseInfo): Promise<ArrayBuffer> {
    const vsixAsset = release.assets.find(asset => asset.name.endsWith('.vsix'));

    if (!vsixAsset) {
      throw new Error('.vsix file not found in release assets');
    }

    try {
      // First attempt with existing session silently
      let headers = await this.getAuthHeaders(false);
      let response = await fetch(vsixAsset.browserDownloadUrl, { headers });

      // Retry if authentication issue detected
      if (!response.ok && (response.status === 404 || response.status === 401 || response.status === 403)) {
        const authenticated = await this.handleAuthError(response);
        
        if (authenticated) {
          headers = await this.getAuthHeaders(false);
          response = await fetch(vsixAsset.browserDownloadUrl, { headers });
        }
      }

      if (!response.ok) {
        throw new Error(`Failed to download .vsix: ${response.status} ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      throw new Error(`Failed to download .vsix file: ${error}`);
    }
  }

  /**
   * Get .vsix asset URL from release
   */
  getVsixAssetUrl(release: ReleaseInfo): string | null {
    const vsixAsset = release.assets.find(asset => asset.name.endsWith('.vsix'));
    return vsixAsset?.browserDownloadUrl || null;
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