import * as vscode from "vscode";
import { AITemplateFile, AITemplateFileType } from "./aiTemplateFile";
import { RepositoryTemplateConfig } from "./repositoryTemplateConfigManagerService";

/**
 * GitHub repository service implementation.
 * Handles fetching content from GitHub repositories (public and private), listing templates by type, and downloading template contents.
 */
export class RepositoryTemplateService {
  private static readonly GITHUB_API_BASE = "https://api.github.com";
  private static readonly GITHUB_AUTH_PROVIDER_ID = "github";
  private static readonly GITHUB_SCOPES = ["repo"];

  private cachedTemplates: AITemplateFile[] | null = null; // Cache for fetched ai template files (infinite TTL for simplicity, manual refresh only)

  constructor(private readonly config: RepositoryTemplateConfig) {
    if (!config.enabled) throw new Error(`Repository is disabled: ${config.name}`);
  }

  /**
   * Fetch all templates from all configured paths at once
   */
  public async fetchAllTemplates(): Promise<AITemplateFile[]> {
    if (this.cachedTemplates) return this.cachedTemplates!;

    try {
      const { owner, repo } = this.parseGitHubUrl();
      const headers = await this.getAuthHeaders();

      const allTemplates: AITemplateFile[] = [];

      // Fetch from all configured paths in parallel
      const fetchPromises: Promise<void>[] = [];

      for (const [type, path] of Object.entries(this.config.paths)) {
        if (!path) continue;

        const fetchPromise = (async () => {
          try {
            const branch = this.config.branch ?? "main";
            const apiUrl = `${RepositoryTemplateService.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

            const response = await fetch(apiUrl, { headers });

            if (!response.ok) {
              if (response.status === 404) {
                console.warn(`Path not found in ${this.config.name}: ${path}`);
                return;
              }
              throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const contents = (await response.json()) as GitHubContentItem[];

            for (const item of contents) {
              if (item.type !== "file" || !item.name.endsWith(".md")) continue;

              allTemplates.push({
                name: item.name,
                type: type as AITemplateFileType,
                rawUrl: item.download_url,
                repository: this.config.name,
                repositoryUrl: this.config.url,
              });
            }
          } catch (error) {
            console.error(`Error fetching ${type} from ${this.config.name}:`, error);
            // Continue with other types even if one fails
          }
        })();

        fetchPromises.push(fetchPromise);
      }

      // Wait for all fetches to complete
      await Promise.all(fetchPromises);

      // Update cache
      this.cachedTemplates = allTemplates;

      return allTemplates;
    } catch (error) {
      console.error(`Error fetching templates from ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Download file content from GitHub
   */
  public async downloadTemplate(templateFile: AITemplateFile): Promise<string> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(templateFile.rawUrl, { headers });

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error(`Error downloading file '${templateFile.name}' from ${templateFile.rawUrl}:`, error);
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
    this.cachedTemplates = null;
  }

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
      Accept: "application/vnd.github.v3+json",
    };

    try {
      const session = await vscode.authentication.getSession(
        RepositoryTemplateService.GITHUB_AUTH_PROVIDER_ID,
        RepositoryTemplateService.GITHUB_SCOPES,
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
}

interface GitHubContentItem {
  name: string;
  path: string;
  download_url: string;
  type: string;
}
