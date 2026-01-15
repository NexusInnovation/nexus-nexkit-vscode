import * as vscode from "vscode";
import { AITemplateFile, AITemplateFileType } from "../models/aiTemplateFile";
import { RepositoryConfig } from "../models/repositoryConfig";

/**
 * GitHub API content item
 */
interface GitHubContentItem {
  name: string;
  path: string;
  download_url: string;
  type: string;
}

/**
 * Provider for fetching templates from a single GitHub repository.
 * Handles authentication, API calls, and downloading template contents.
 */
export class RepositoryTemplateProvider {
  private static readonly GITHUB_API_BASE = "https://api.github.com";
  private static readonly GITHUB_AUTH_PROVIDER_ID = "github";
  private static readonly GITHUB_SCOPES = ["repo"];

  constructor(private readonly config: RepositoryConfig) {
    if (!config.enabled) {
      throw new Error(`Repository is disabled: ${config.name}`);
    }
  }

  /**
   * Fetch all templates from all configured paths
   */
  public async fetchAllTemplates(): Promise<AITemplateFile[]> {
    try {
      const { owner, repo } = this.parseGitHubUrl();
      const headers = await this.getAuthHeaders();

      const allTemplates: AITemplateFile[] = [];

      // Fetch from all configured paths in parallel
      const fetchPromises: Promise<void>[] = [];

      for (const [type, path] of Object.entries(this.config.paths)) {
        if (!path) {
          continue;
        }

        const fetchPromise = (async () => {
          try {
            const branch = this.config.branch ?? "main";
            const apiUrl = `${RepositoryTemplateProvider.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

            const response = await fetch(apiUrl, { headers });

            if (!response.ok) {
              if (response.status === 404) {
                console.warn(`Path not found in ${this.config.name}: ${path}`);
                return;
              }
              throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const contents = (await response.json()) as GitHubContentItem[];

            // Handle skills type differently - fetch folders instead of .md files
            if (type === "skills") {
              for (const item of contents) {
                if (item.type === "dir") {
                  allTemplates.push({
                    name: item.name,
                    type: type as AITemplateFileType,
                    rawUrl: item.download_url || "",
                    repository: this.config.name,
                    repositoryUrl: this.config.url,
                    isDirectory: true,
                    sourcePath: item.path,
                  });
                }
              }
            } else {
              // Regular handling for file-based templates
              for (const item of contents) {
                if (item.type !== "file" || !item.name.endsWith(".md")) {
                  continue;
                }

                allTemplates.push({
                  name: item.name,
                  type: type as AITemplateFileType,
                  rawUrl: item.download_url,
                  repository: this.config.name,
                  repositoryUrl: this.config.url,
                });
              }
            }
          } catch (error) {
            console.error(`Error fetching ${type} from ${this.config.name}:`, error);
            throw error; // Propagate error for better error tracking
          }
        })();

        fetchPromises.push(fetchPromise);
      }

      // Wait for all fetches to complete
      await Promise.all(fetchPromises);

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
   * Recursively download all files in a directory
   * Returns a map of relative file paths to their contents
   */
  public async downloadDirectoryContents(templateFile: AITemplateFile): Promise<Map<string, string>> {
    if (!templateFile.isDirectory || !templateFile.sourcePath) {
      throw new Error(`Template is not a directory: ${templateFile.name}`);
    }

    const fileContents = new Map<string, string>();
    const { owner, repo } = this.parseGitHubUrl();
    const headers = await this.getAuthHeaders();
    const branch = this.config.branch ?? "main";

    const downloadRecursive = async (path: string, basePath: string): Promise<void> => {
      const apiUrl = `${RepositoryTemplateProvider.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(`Failed to fetch directory contents: ${response.status} ${response.statusText}`);
      }

      const contents = (await response.json()) as GitHubContentItem[];

      for (const item of contents) {
        if (item.type === "file") {
          // Download file content
          const fileResponse = await fetch(item.download_url, { headers });
          if (!fileResponse.ok) {
            throw new Error(`Failed to download file: ${item.path}`);
          }
          const content = await fileResponse.text();
          // Store with relative path (remove the base skill folder path)
          const relativePath = item.path.replace(basePath + "/", "");
          fileContents.set(relativePath, content);
        } else if (item.type === "dir") {
          // Recursively download subdirectory
          await downloadRecursive(item.path, basePath);
        }
      }
    };

    await downloadRecursive(templateFile.sourcePath, templateFile.sourcePath);
    return fileContents;
  }

  /**
   * Get repository display name
   */
  public getRepositoryName(): string {
    return this.config.name;
  }

  /**
   * Get repository configuration
   */
  public getConfig(): RepositoryConfig {
    return this.config;
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
   * Get GitHub authentication headers
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "User-Agent": "Nexkit-VSCode-Extension",
      Accept: "application/vnd.github.v3+json",
    };

    try {
      const session = await vscode.authentication.getSession(
        RepositoryTemplateProvider.GITHUB_AUTH_PROVIDER_ID,
        RepositoryTemplateProvider.GITHUB_SCOPES,
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
