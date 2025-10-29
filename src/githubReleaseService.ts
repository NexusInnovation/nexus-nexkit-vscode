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
      // Adjust Accept header for binary download
      headers['Accept'] = 'application/octet-stream';
      let response = await this.fetchWithRedirects(vsixAsset.browserDownloadUrl, { headers });

      // Retry if authentication issue detected (non-redirect auth failures)
      if (!response.ok && (response.status === 404 || response.status === 401 || response.status === 403)) {
        const authenticated = await this.handleAuthError(response);
        if (authenticated) {
          headers = await this.getAuthHeaders(false);
          headers['Accept'] = 'application/octet-stream';
          response = await this.fetchWithRedirects(vsixAsset.browserDownloadUrl, { headers });
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
   * Fetch helper that manually follows redirects. Some extension host environments
   * have had issues auto-following 302 responses for large binary assets.
   * This method ensures we follow up to maxRedirects and drop Authorization on cross-origin hops.
   * @param url Initial URL to fetch
   * @param init Initial request init (supports headers + method)
   * @param maxRedirects Maximum redirects to follow to avoid infinite loops
   */
  private async fetchWithRedirects(
    url: string,
    init: { headers?: Record<string, string>; method?: string } = {},
    maxRedirects: number = 10
  ): Promise<Response> {
    let currentUrl = url;
    let redirects = 0;
    let method = init.method || 'GET';
    const headers: Record<string, string> = { ...(init.headers || {}) };

    // Track original host for Authorization logic
    const originalHost = new URL(url).host;

    while (redirects <= maxRedirects) {
      const response = await fetch(currentUrl, { headers, method, redirect: 'manual' });

      // If not a redirect status, return immediately
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return response;
      }

      const location = response.headers.get('location');
      if (!location) {
        // Location header missing on redirect - treat as error
        return response; // Let caller handle non-ok with missing location
      }

      redirects += 1;
      if (redirects > maxRedirects) {
        throw new Error(`Too many redirects (${redirects}) attempting to fetch ${url}`);
      }

      // Resolve relative locations against current URL
      const nextUrl = new URL(location, currentUrl).toString();
      const nextHost = new URL(nextUrl).host;

      // Per GitHub asset download behavior, subsequent hosts (e.g., codeload.github.com, objects...) do not require Authorization
      // Remove Authorization header if host changes to prevent leaking tokens cross-origin.
      if (headers['Authorization'] && nextHost !== originalHost) {
        delete headers['Authorization'];
      }

      // For 303, RFC allows switching to GET
      if (response.status === 303) {
        method = 'GET';
      }

      currentUrl = nextUrl;
    }

    throw new Error(`Redirect handling exited unexpectedly for ${url}`);
  }
}