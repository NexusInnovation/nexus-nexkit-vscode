import * as vscode from "vscode";
import { AITemplateFile, AITemplateFileType } from "../models/aiTemplateFile";
import { RepositoryConfig } from "../models/repositoryConfig";
import { GitHubAuthHelper } from "../../../shared/utils/githubAuthHelper";
import { LoggingService } from "../../../shared/services/loggingService";

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
  private readonly _logging = LoggingService.getInstance();

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

      // Get auth info before making requests
      const authInfo = await GitHubAuthHelper.getAuthInfo();
      const headers = await this.getAuthHeaders();

      const branch = this.config.branch ?? "main";
      this._logging.info(`[Templates] Fetching from GitHub repo '${this.config.name}'`, {
        owner,
        repo,
        branch,
        modes: this.config.modes,
        paths: this.config.paths,
        authSource: authInfo.source,
        isAuthenticated: authInfo.available,
      });

      const allTemplates: AITemplateFile[] = [];

      // Fetch from all configured paths in parallel
      const fetchPromises: Promise<void>[] = [];

      for (const [type, path] of Object.entries(this.config.paths)) {
        if (!path) {
          continue;
        }

        const fetchPromise = (async () => {
          try {
            const apiUrl = `${RepositoryTemplateProvider.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

            this._logging.debug(`[Templates] GitHub API request starting`, {
              repository: this.config.name,
              type,
              path,
              branch,
              apiUrl,
            });

            const requestStart = Date.now();
            const response = await fetch(apiUrl, { headers });
            const requestDuration = Date.now() - requestStart;

            // Extract GitHub rate limit headers
            const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
            const rateLimitLimit = response.headers.get("x-ratelimit-limit");
            const rateLimitReset = response.headers.get("x-ratelimit-reset");
            const rateLimitUsed = response.headers.get("x-ratelimit-used");
            const rateLimitResource = response.headers.get("x-ratelimit-resource");

            const rateLimitInfo = {
              remaining: rateLimitRemaining,
              limit: rateLimitLimit,
              used: rateLimitUsed,
              resource: rateLimitResource,
              resetAt: rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toISOString() : undefined,
            };

            this._logging.debug(`[Templates] GitHub API response received`, {
              repository: this.config.name,
              type,
              path,
              status: response.status,
              statusText: response.statusText,
              durationMs: requestDuration,
              rateLimit: rateLimitInfo,
              contentType: response.headers.get("content-type"),
              contentLength: response.headers.get("content-length"),
              etag: response.headers.get("etag"),
            });

            if (!response.ok) {
              if (response.status === 404) {
                // 404 can mean: path doesn't exist OR no access to private repo
                const authInfo = await GitHubAuthHelper.getAuthInfo();
                const isLikelyPrivate = !authInfo.available;

                if (isLikelyPrivate) {
                  this._logging.error(`[Templates] Cannot access repository - authentication required`, {
                    repository: this.config.name,
                    owner,
                    repo,
                    path,
                    branch,
                    apiUrl,
                    authStatus: {
                      source: authInfo.source,
                      available: authInfo.available,
                    },
                    rateLimit: rateLimitInfo,
                    action: "Sign in to GitHub in VS Code to access private repositories",
                  });

                  // Show error message with guidance
                  vscode.window.showErrorMessage(
                    `Cannot access private repository '${this.config.name}'. Sign in to GitHub: click the profile icon (bottom-left) and select "Sign in with GitHub".`
                  );
                } else {
                  this._logging.warn(`[Templates] GitHub path not found (404)`, {
                    repository: this.config.name,
                    path,
                    branch,
                    apiUrl,
                    rateLimit: rateLimitInfo,
                    authStatus: {
                      source: authInfo.source,
                      available: authInfo.available,
                    },
                    hint: "Verify the branch and path are correct. The repository exists but this path may not.",
                  });
                }
                return;
              }
              if (response.status === 401 || response.status === 403) {
                // Check if this is rate limiting specifically
                const isRateLimit = response.status === 403 && rateLimitRemaining === "0";

                this._logging.error(`[Templates] GitHub authentication/authorization failed`, {
                  repository: this.config.name,
                  status: response.status,
                  statusText: response.statusText,
                  isRateLimit,
                  path,
                  branch,
                  apiUrl,
                  rateLimit: rateLimitInfo,
                  hint: isRateLimit
                    ? `GitHub API rate limit exceeded. Limit resets at ${rateLimitInfo.resetAt}. Consider authenticating with GitHub to get higher rate limits (60/hour unauthenticated vs 5000/hour authenticated).`
                    : response.status === 403
                      ? "This can be GitHub rate limiting or missing permissions. Try signing into GitHub in VS Code, or wait and retry."
                      : "Please sign in to GitHub via VS Code to access private repositories.",
                });
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
              }

              this._logging.error(`[Templates] GitHub API request failed`, {
                repository: this.config.name,
                status: response.status,
                statusText: response.statusText,
                path,
                branch,
                apiUrl,
                rateLimit: rateLimitInfo,
              });
              throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const contents = (await response.json()) as GitHubContentItem[];
            if (!Array.isArray(contents)) {
              this._logging.warn(`[Templates] Unexpected GitHub contents response shape`, {
                repository: this.config.name,
                path,
                branch,
                apiUrl,
                responseType: typeof contents,
              });
              return;
            }

            // Handle skills type differently - fetch folders instead of .md files
            if (type === "skills") {
              let count = 0;
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
                  count++;
                }
              }

              this._logging.info(`[Templates] Fetched ${count} skill folder(s) from '${this.config.name}'`, {
                repository: this.config.name,
                type,
                path,
                branch,
              });
            } else {
              // Regular handling for file-based templates
              let count = 0;
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

                count++;
              }

              this._logging.info(`[Templates] Fetched ${count} ${type} template(s) from '${this.config.name}'`, {
                repository: this.config.name,
                type,
                path,
                branch,
              });
            }
          } catch (error) {
            this._logging.error(`[Templates] Error fetching '${type}' from '${this.config.name}'`, error);
            throw error; // Propagate error for better error tracking
          }
        })();

        fetchPromises.push(fetchPromise);
      }

      // Wait for all fetches to complete
      await Promise.all(fetchPromises);

      this._logging.info(`[Templates] Completed GitHub fetch for '${this.config.name}'`, {
        repository: this.config.name,
        templateCount: allTemplates.length,
      });

      return allTemplates;
    } catch (error) {
      this._logging.error(`[Templates] Failed to fetch templates from '${this.config.name}'`, error);
      throw error;
    }
  }

  /**
   * Download file content from GitHub
   */
  public async downloadTemplate(templateFile: AITemplateFile): Promise<string> {
    try {
      this._logging.debug(`[Templates] Downloading template file from GitHub`, {
        repository: templateFile.repository,
        name: templateFile.name,
        type: templateFile.type,
        url: templateFile.rawUrl,
      });

      const headers = await this.getAuthHeaders();
      const requestStart = Date.now();
      const response = await fetch(templateFile.rawUrl, { headers });
      const requestDuration = Date.now() - requestStart;

      const rateLimitInfo = {
        remaining: response.headers.get("x-ratelimit-remaining"),
        limit: response.headers.get("x-ratelimit-limit"),
        resource: response.headers.get("x-ratelimit-resource"),
      };

      this._logging.debug(`[Templates] Template file download response`, {
        repository: templateFile.repository,
        name: templateFile.name,
        status: response.status,
        durationMs: requestDuration,
        rateLimit: rateLimitInfo,
        contentLength: response.headers.get("content-length"),
      });

      if (!response.ok) {
        this._logging.error(`[Templates] Failed to download template file`, {
          repository: templateFile.repository,
          name: templateFile.name,
          status: response.status,
          statusText: response.statusText,
          url: templateFile.rawUrl,
          rateLimit: rateLimitInfo,
        });
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      const content = await response.text();
      this._logging.debug(`[Templates] Template file downloaded successfully`, {
        repository: templateFile.repository,
        name: templateFile.name,
        contentSize: content.length,
      });

      return content;
    } catch (error) {
      this._logging.error(`[Templates] Error downloading template file '${templateFile.name}'`, error);
      throw error;
    }
  }

  /**
   * Download the SKILL.md metadata file from a skill directory on GitHub.
   * Returns the file content, or null if the SKILL.md does not exist.
   */
  public async downloadSkillMetadataFile(templateFile: AITemplateFile): Promise<string | null> {
    if (!templateFile.isDirectory || !templateFile.sourcePath) {
      throw new Error(`Template is not a skill directory: ${templateFile.name}`);
    }

    const { owner, repo } = this.parseGitHubUrl();
    const headers = await this.getAuthHeaders();
    const branch = this.config.branch ?? "main";
    const skillMdPath = `${templateFile.sourcePath}/SKILL.md`;
    const apiUrl = `${RepositoryTemplateProvider.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${skillMdPath}?ref=${branch}`;

    this._logging.debug(`[Templates] Fetching SKILL.md metadata from GitHub`, {
      repository: templateFile.repository,
      skillName: templateFile.name,
      skillMdPath,
    });

    const response = await fetch(apiUrl, { headers });

    if (response.status === 404) {
      this._logging.debug(`[Templates] SKILL.md not found for skill`, {
        repository: templateFile.repository,
        skillName: templateFile.name,
        skillMdPath,
      });
      return null;
    }

    if (!response.ok) {
      this._logging.error(`[Templates] Failed to fetch SKILL.md`, {
        repository: templateFile.repository,
        skillName: templateFile.name,
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Failed to fetch SKILL.md: ${response.status} ${response.statusText}`);
    }

    // The GitHub contents API returns a JSON object with base64-encoded content
    const item = (await response.json()) as { download_url?: string; content?: string; encoding?: string };

    if (item.content && item.encoding === "base64") {
      return Buffer.from(item.content.replace(/\n/g, ""), "base64").toString("utf8");
    }

    if (item.download_url) {
      const rawResponse = await fetch(item.download_url, { headers });
      if (!rawResponse.ok) {
        throw new Error(`Failed to download SKILL.md: ${rawResponse.status} ${rawResponse.statusText}`);
      }
      return rawResponse.text();
    }

    return null;
  }

  /**
   * Recursively download all files in a directory
   * Returns a map of relative file paths to their contents
   */
  public async downloadDirectoryContents(templateFile: AITemplateFile): Promise<Map<string, string>> {
    if (!templateFile.isDirectory || !templateFile.sourcePath) {
      throw new Error(`Template is not a directory: ${templateFile.name}`);
    }

    this._logging.debug(`[Templates] Downloading directory contents from GitHub`, {
      repository: templateFile.repository,
      name: templateFile.name,
      sourcePath: templateFile.sourcePath,
    });

    const fileContents = new Map<string, string>();
    const { owner, repo } = this.parseGitHubUrl();
    const headers = await this.getAuthHeaders();
    const branch = this.config.branch ?? "main";
    let filesDownloaded = 0;
    let directoriesProcessed = 0;

    const downloadRecursive = async (path: string, basePath: string): Promise<void> => {
      const apiUrl = `${RepositoryTemplateProvider.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

      this._logging.debug(`[Templates] Fetching directory listing`, {
        repository: templateFile.repository,
        path,
      });

      const requestStart = Date.now();
      const response = await fetch(apiUrl, { headers });
      const requestDuration = Date.now() - requestStart;

      const rateLimitInfo = {
        remaining: response.headers.get("x-ratelimit-remaining"),
        limit: response.headers.get("x-ratelimit-limit"),
      };

      this._logging.debug(`[Templates] Directory listing response`, {
        repository: templateFile.repository,
        path,
        status: response.status,
        durationMs: requestDuration,
        rateLimit: rateLimitInfo,
      });

      if (!response.ok) {
        this._logging.error(`[Templates] Failed to fetch directory contents`, {
          repository: templateFile.repository,
          path,
          status: response.status,
          statusText: response.statusText,
          rateLimit: rateLimitInfo,
        });
        throw new Error(`Failed to fetch directory contents: ${response.status} ${response.statusText}`);
      }

      const contents = (await response.json()) as GitHubContentItem[];
      directoriesProcessed++;

      for (const item of contents) {
        if (item.type === "file") {
          // Download file content
          this._logging.debug(`[Templates] Downloading directory file`, {
            repository: templateFile.repository,
            filePath: item.path,
          });

          const fileStart = Date.now();
          const fileResponse = await fetch(item.download_url, { headers });
          const fileDuration = Date.now() - fileStart;

          if (!fileResponse.ok) {
            this._logging.error(`[Templates] Failed to download directory file`, {
              repository: templateFile.repository,
              filePath: item.path,
              status: fileResponse.status,
            });
            throw new Error(`Failed to download file: ${item.path}`);
          }

          const content = await fileResponse.text();
          filesDownloaded++;

          this._logging.debug(`[Templates] Directory file downloaded`, {
            repository: templateFile.repository,
            filePath: item.path,
            durationMs: fileDuration,
            contentSize: content.length,
          });

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

    this._logging.info(`[Templates] Directory contents downloaded successfully`, {
      repository: templateFile.repository,
      name: templateFile.name,
      filesDownloaded,
      directoriesProcessed,
    });

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
   * Uses GitHubAuthHelper for unified authentication across environments
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers = await GitHubAuthHelper.getAuthHeaders(
      ["repo"], // Required scopes
      "Nexkit-VSCode-Extension", // User agent
      false // Don't require auth (graceful degradation)
    );

    return headers;
  }
}
