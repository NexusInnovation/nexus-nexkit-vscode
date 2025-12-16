import * as vscode from "vscode";
import { ItemCategory } from "../types/categories";

/**
 * Represents an item (md files for agents, prompts, instructions, chatmodes) from a github repository
 */
export interface RepositoryItem {
  name: string; // Filename (e.g., "python.agent.md")
  category: ItemCategory; // Category of the item
  rawUrl: string; // Direct download URL
  repository: string; // Repository name
  repositoryUrl: string; // Repository URL
}

/**
 * Configuration required for a GitHub repository (users can add custom ones in the extension settings)
 */
export interface GitHubRepositoryConfig {
  name: string; // Display name for the repository
  url: string; // GitHub repository URL
  branch?: string; // Branch to fetch content from (default: "main")
  paths: Partial<Record<ItemCategory, string>>; // Paths for each content category in the repository (e.g., { agents: "agents/", prompts: "prompts/" })
}

/**
 * GitHub repository service implementation.
 * Handles fetching content from GitHub repositories (public and private), listing items by category, and downloading file contents.
 */
export class GitHubRepositoryService {
  private static readonly GITHUB_API_BASE = "https://api.github.com";
  private static readonly GITHUB_AUTH_PROVIDER_ID = "github";
  private static readonly GITHUB_SCOPES = ["repo"];

  private cachedItems: RepositoryItem[] | null = null; // Cache for fetched items (infinite TTL for simplicity, manual refresh only)

  constructor(
    private readonly config: GitHubRepositoryConfig,
  ) {}

  /**
   * Extract owner and repo name from GitHub URL
   */
  private parseGitHubUrl(): { owner: string; repo: string } {
    const match = this.config.url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      throw new Error(`Invalid GitHub URL: ${this.config.url}`);
    }
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  }

  /**
   * Get GitHub authentication session (always required)
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "User-Agent": "Nexkit-VSCode-Extension",
      "Accept": "application/vnd.github.v3+json",
    };

    try {
      const session = await vscode.authentication.getSession(
        GitHubRepositoryService.GITHUB_AUTH_PROVIDER_ID,
        GitHubRepositoryService.GITHUB_SCOPES,
        { createIfNone: true }
      );
      if (session) {
        headers["Authorization"] = `token ${session.accessToken}`;
      }
    } catch (error) {
      console.warn(`GitHub authentication failed for ${this.config.name}:`, error);
      throw new Error(`Authentication required for ${this.config.name}`);
    }

    return headers;
  }

  /**
   * Fetch all items from all configured paths at once
   */
  public async fetchAllItems(): Promise<RepositoryItem[]> {
    if (this.cachedItems) return this.cachedItems!;

    try {
      const { owner, repo } = this.parseGitHubUrl();
      const headers = await this.getAuthHeaders();

      const allItems: RepositoryItem[] = [];

      // Fetch from all configured paths in parallel
      const fetchPromises: Promise<void>[] = [];

      for (const [category, path] of Object.entries(this.config.paths)) {
        if (!path) continue;

        const fetchPromise = (async () => {
          try {
            const branch = this.config.branch ?? "main";
            const apiUrl = `${GitHubRepositoryService.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
            
            const response = await fetch(apiUrl, { headers });

            if (!response.ok) {
              if (response.status === 404) {
                console.warn(`Path not found in ${this.config.name}: ${path}`);
                return;
              }
              throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const contents = await response.json() as GitHubContentItem[];

            for (const item of contents) {
              if (item.type !== "file" || !item.name.endsWith(".md")) continue;

              allItems.push({
                name: item.name,
                category: category as ItemCategory,
                rawUrl: item.download_url,
                repository: this.config.name,
                repositoryUrl: this.config.url,
              });
            }
          } catch (error) {
            console.error(`Error fetching ${category} from ${this.config.name}:`, error);
            // Continue with other categories even if one fails
          }
        })();

        fetchPromises.push(fetchPromise);
      }

      // Wait for all fetches to complete
      await Promise.all(fetchPromises);

      // Update cache
      this.cachedItems = allItems;

      return allItems;
    } catch (error) {
      console.error(`Error fetching items from ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Download file content from GitHub
   */
  public async downloadFile(repositoryItem: RepositoryItem): Promise<string> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(repositoryItem.rawUrl, { headers });

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error(`Error downloading file '${repositoryItem.name}' from ${repositoryItem.rawUrl}:`, error);
      throw error;
    }
  }

  /**
   * Get repository display name
   */
  public getRepositoryName(): string {
    return this.config.name;
  }

  /**
   * Clear cache to force refresh
   */
  public clearCache(): void {
    this.cachedItems = null;
  }
}

interface GitHubContentItem {
  name: string;
  path: string;
  download_url: string;
  type: string;
}