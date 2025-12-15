import * as vscode from "vscode";

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
  private static readonly REPO_OWNER = "NexusInnovation";
  private static readonly REPO_NAME = "nexkit-vscode";
  private static readonly BASE_URL = "https://api.github.com";
  private static readonly GITHUB_AUTH_PROVIDER_ID = "github";
  private static readonly REQUIRED_SCOPES = ["repo"];

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Get GitHub authentication session with required scopes
   * @param createIfNone If true, prompt user to sign in if not authenticated
   */
  private async getGitHubSession(
    createIfNone: boolean = false
  ): Promise<vscode.AuthenticationSession | undefined> {
    try {
      const session = await vscode.authentication.getSession(
        GitHubReleaseService.GITHUB_AUTH_PROVIDER_ID,
        GitHubReleaseService.REQUIRED_SCOPES,
        { createIfNone, silent: !createIfNone }
      );
      return session;
    } catch (error) {
      console.error("Failed to get GitHub authentication session:", error);
      return undefined;
    }
  }

  /**
   * Get authentication headers for GitHub API requests
   * @param requireAuth If true, will prompt for authentication if not already authenticated
   */
  private async getAuthHeaders(
    requireAuth: boolean = true
  ): Promise<Record<string, string>> {
    const session = await this.getGitHubSession(requireAuth);
    const headers: Record<string, string> = {
      "User-Agent": "Nexkit-VSCode-Extension",
      Accept: "application/vnd.github.v3+json",
    };

    if (session) {
      headers["Authorization"] = `Bearer ${session.accessToken}`;
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
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    ) {
      const message =
        response.status === 404
          ? "Repository not found. This may be a private repository. Please sign in to GitHub."
          : response.status === 401
          ? "GitHub authentication required to access private repositories."
          : "GitHub API rate limit exceeded or insufficient permissions.";

      const signIn = "Sign In to GitHub";
      const result = await vscode.window.showErrorMessage(
        message,
        signIn,
        "Cancel"
      );

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
      if (
        !response.ok &&
        (response.status === 404 ||
          response.status === 401 ||
          response.status === 403)
      ) {
        const authenticated = await this.handleAuthError(response);

        if (authenticated) {
          // Retry with new authentication
          headers = await this.getAuthHeaders(false); // Don't prompt again, we just authenticated
          response = await fetch(url, { headers });
        }
      }

      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as any;

      return {
        tagName: data.tag_name,
        publishedAt: data.published_at,
        assets: data.assets.map((asset: any) => ({
          name: asset.name,
          browserDownloadUrl: asset.browser_download_url,
          size: asset.size,
        })),
      };
    } catch (error) {
      throw new Error(`Failed to fetch latest release: ${error}`);
    }
  }

  /**
   * Download .vsix file from release assets
   */
  async downloadVsixAsset(release: ReleaseInfo): Promise<ArrayBuffer> {
    const vsixAsset = release.assets.find((asset) =>
      asset.name.endsWith(".vsix")
    );

    if (!vsixAsset) {
      throw new Error(".vsix file not found in release assets");
    }

    try {
      // Get the asset ID to use the GitHub API endpoint
      const assetId = await this.getAssetIdFromRelease(release, vsixAsset.name);

      if (!assetId) {
        // Fallback to browser download URL if we can't get asset ID
        return this.downloadViaDirectUrl(vsixAsset.browserDownloadUrl);
      }

      // Use GitHub API endpoint for private repository access
      const apiUrl = `${GitHubReleaseService.BASE_URL}/repos/${GitHubReleaseService.REPO_OWNER}/${GitHubReleaseService.REPO_NAME}/releases/assets/${assetId}`;

      // First attempt with existing session silently
      let headers = await this.getAuthHeaders(false);
      // Set Accept header for binary download to trigger redirect to actual file
      headers["Accept"] = "application/octet-stream";

      let response = await this.fetchWithRedirectsPrivateRepo(apiUrl, {
        headers,
      });

      // Retry if authentication issue detected
      if (
        !response.ok &&
        (response.status === 404 ||
          response.status === 401 ||
          response.status === 403)
      ) {
        const authenticated = await this.handleAuthError(response);
        if (authenticated) {
          headers = await this.getAuthHeaders(false);
          headers["Accept"] = "application/octet-stream";
          response = await this.fetchWithRedirectsPrivateRepo(apiUrl, {
            headers,
          });
        }
      }

      if (!response.ok) {
        throw new Error(
          `Failed to download .vsix: ${response.status} ${response.statusText}`
        );
      }

      return await response.arrayBuffer();
    } catch (error) {
      throw new Error(`Failed to download .vsix file: ${error}`);
    }
  }

  /**
   * Fallback method to download via direct URL (for public repos or when API fails)
   */
  private async downloadViaDirectUrl(url: string): Promise<ArrayBuffer> {
    let headers = await this.getAuthHeaders(false);
    headers["Accept"] = "application/octet-stream";

    let response = await this.fetchWithRedirectsPrivateRepo(url, { headers });

    if (
      !response.ok &&
      (response.status === 404 ||
        response.status === 401 ||
        response.status === 403)
    ) {
      const authenticated = await this.handleAuthError(response);
      if (authenticated) {
        headers = await this.getAuthHeaders(false);
        headers["Accept"] = "application/octet-stream";
        response = await this.fetchWithRedirectsPrivateRepo(url, { headers });
      }
    }

    if (!response.ok) {
      throw new Error(
        `Failed to download .vsix: ${response.status} ${response.statusText}`
      );
    }

    return await response.arrayBuffer();
  }

  /**
   * Get .vsix asset URL from release
   */
  getVsixAssetUrl(release: ReleaseInfo): string | null {
    const vsixAsset = release.assets.find((asset) =>
      asset.name.endsWith(".vsix")
    );
    return vsixAsset?.browserDownloadUrl || null;
  }

  /**
   * Extract asset ID from browser download URL
   * Example: https://github.com/owner/repo/releases/download/v1.0.0/file.vsix
   * We need to get the asset ID via the API instead
   */
  private async getAssetIdFromRelease(
    release: ReleaseInfo,
    assetName: string
  ): Promise<number | null> {
    try {
      const headers = await this.getAuthHeaders(false);
      const url = `${GitHubReleaseService.BASE_URL}/repos/${GitHubReleaseService.REPO_OWNER}/${GitHubReleaseService.REPO_NAME}/releases/tags/${release.tagName}`;

      const response = await fetch(url, { headers });
      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as any;
      const asset = data.assets?.find((a: any) => a.name === assetName);
      return asset?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch helper specifically designed for private repository downloads.
   * Keeps Authorization header for GitHub-related domains to handle private repo access.
   */
  private async fetchWithRedirectsPrivateRepo(
    url: string,
    init: { headers?: Record<string, string>; method?: string } = {},
    maxRedirects: number = 10
  ): Promise<Response> {
    let currentUrl = url;
    let redirects = 0;
    let method = init.method || "GET";
    const headers: Record<string, string> = { ...(init.headers || {}) };

    // List of GitHub-related domains that should keep the Authorization header
    const githubDomains = [
      "github.com",
      "api.github.com",
      "codeload.github.com",
      "objects-origin.githubusercontent.com",
    ];

    while (redirects <= maxRedirects) {
      const response = await fetch(currentUrl, {
        headers,
        method,
        redirect: "manual",
      });

      // If not a redirect status, return immediately
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return response;
      }

      const location = response.headers.get("location");
      if (!location) {
        // Location header missing on redirect - treat as error
        return response; // Let caller handle non-ok with missing location
      }

      redirects += 1;
      if (redirects > maxRedirects) {
        throw new Error(
          `Too many redirects (${redirects}) attempting to fetch ${url}`
        );
      }

      // Resolve relative locations against current URL
      const nextUrl = new URL(location, currentUrl).toString();
      const nextHost = new URL(nextUrl).host;

      // For private repositories, keep Authorization header for GitHub domains
      // Remove it only when redirecting to completely external domains (like cloud storage)
      if (headers["Authorization"] && !githubDomains.includes(nextHost)) {
        // Only remove auth when going to non-GitHub domains
        delete headers["Authorization"];
      }

      // For 303, RFC allows switching to GET
      if (response.status === 303) {
        method = "GET";
      }

      currentUrl = nextUrl;
    }

    throw new Error(`Redirect handling exited unexpectedly for ${url}`);
  }
}
