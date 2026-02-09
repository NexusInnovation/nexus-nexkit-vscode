/**
 * GitHub API service for fetching repository data
 */

import { Config } from "../utils/config";
import { Cache } from "../utils/cache";
import { GitHubRelease, PackageJson } from "../utils/types";

export class GitHubService {
  private static readonly CACHE_KEY_PACKAGE = "package.json";
  private static readonly CACHE_KEY_RELEASE = "latest-release";

  /**
   * Get authentication headers for GitHub API
   */
  private static getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${Config.githubPat}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "nexkit-badge-service/1.0",
    };
  }

  /**
   * Fetch package.json from the repository
   */
  static async fetchPackageJson(): Promise<PackageJson> {
    // Check cache first
    const cached = Cache.get<PackageJson>(this.CACHE_KEY_PACKAGE);
    if (cached) {
      return cached;
    }

    const url = `${Config.githubApiBaseUrl}/repos/${Config.githubOwner}/${Config.githubRepo}/contents/package.json`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;

      // Decode base64 content
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const packageJson = JSON.parse(content) as PackageJson;

      // Cache the result
      Cache.set(this.CACHE_KEY_PACKAGE, packageJson, Config.cacheTtlSeconds);

      return packageJson;
    } catch (error) {
      throw new Error(`Failed to fetch package.json: ${error}`);
    }
  }

  /**
   * Fetch latest release from the repository
   */
  static async fetchLatestRelease(): Promise<GitHubRelease> {
    // Check cache first
    const cached = Cache.get<GitHubRelease>(this.CACHE_KEY_RELEASE);
    if (cached) {
      return cached;
    }

    const url = `${Config.githubApiBaseUrl}/repos/${Config.githubOwner}/${Config.githubRepo}/releases/latest`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        // If no releases found, return a default response
        if (response.status === 404) {
          return {
            tagName: "no-release",
            name: "No Release",
            publishedAt: new Date().toISOString(),
            draft: false,
            prerelease: false,
          };
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;

      const release: GitHubRelease = {
        tagName: data.tag_name,
        name: data.name || data.tag_name,
        publishedAt: data.published_at,
        draft: data.draft,
        prerelease: data.prerelease,
      };

      // Cache the result
      Cache.set(this.CACHE_KEY_RELEASE, release, Config.cacheTtlSeconds);

      return release;
    } catch (error) {
      throw new Error(`Failed to fetch latest release: ${error}`);
    }
  }
}
