import * as vscode from "vscode";
import * as path from "path";
import { AITemplateFile, AITemplateFileType } from "../models/aiTemplateFile";
import { RepositoryConfig } from "../models/repositoryConfig";
import { LoggingService } from "../../../shared/services/loggingService";

/**
 * Provider for fetching templates from a local folder.
 * Handles path resolution (absolute, relative, home directory) and local filesystem operations.
 */
export class LocalFolderTemplateProvider {
  private resolvedBasePath: vscode.Uri | undefined;
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
      const basePath = await this.resolveBasePath();
      if (!basePath) {
        throw new Error(`Could not resolve base path for ${this.config.name}: ${this.config.url}`);
      }

      this._logging.info(`[Templates] Fetching from local repository '${this.config.name}'`, {
        repository: this.config.name,
        basePath: basePath.fsPath,
        modes: this.config.modes,
        paths: this.config.paths,
      });

      const allTemplates: AITemplateFile[] = [];

      // Fetch from all configured paths in parallel
      const fetchPromises: Promise<void>[] = [];

      for (const [type, relativePath] of Object.entries(this.config.paths)) {
        if (!relativePath) {
          continue;
        }

        const fetchPromise = (async () => {
          try {
            const fullPath = vscode.Uri.joinPath(basePath, relativePath);

            // Check if directory exists
            try {
              await vscode.workspace.fs.stat(fullPath);
            } catch (error) {
              this._logging.warn(`[Templates] Local path not found`, {
                repository: this.config.name,
                type,
                relativePath,
                fullPath: fullPath.fsPath,
              });
              return;
            }

            // Read directory contents
            const entries = await vscode.workspace.fs.readDirectory(fullPath);

            // Handle skills type differently - fetch folders instead of .md files
            if (type === "skills") {
              let count = 0;
              for (const [name, fileType] of entries) {
                if (fileType === vscode.FileType.Directory) {
                  const dirPath = vscode.Uri.joinPath(fullPath, name);
                  allTemplates.push({
                    name,
                    type: type as AITemplateFileType,
                    rawUrl: dirPath.toString(),
                    repository: this.config.name,
                    repositoryUrl: this.config.url,
                    isDirectory: true,
                    sourcePath: `${relativePath}/${name}`,
                  });
                  count++;
                }
              }

              this._logging.info(`[Templates] Fetched ${count} skill folder(s) from '${this.config.name}'`, {
                repository: this.config.name,
                type,
                relativePath,
              });
            } else {
              // Regular handling for file-based templates
              let count = 0;
              for (const [name, fileType] of entries) {
                // Only process markdown files
                if (fileType !== vscode.FileType.File || !name.endsWith(".md")) {
                  continue;
                }

                const filePath = vscode.Uri.joinPath(fullPath, name);

                allTemplates.push({
                  name,
                  type: type as AITemplateFileType,
                  rawUrl: filePath.toString(), // Store URI as string for consistency
                  repository: this.config.name,
                  repositoryUrl: this.config.url,
                });

                count++;
              }

              this._logging.info(`[Templates] Fetched ${count} ${type} template(s) from '${this.config.name}'`, {
                repository: this.config.name,
                type,
                relativePath,
              });
            }
          } catch (error) {
            this._logging.error(`[Templates] Error fetching '${type}' from local repo '${this.config.name}'`, error);
            throw error;
          }
        })();

        fetchPromises.push(fetchPromise);
      }

      // Wait for all fetches to complete
      await Promise.all(fetchPromises);

      this._logging.info(`[Templates] Completed local fetch for '${this.config.name}'`, {
        repository: this.config.name,
        templateCount: allTemplates.length,
      });

      return allTemplates;
    } catch (error) {
      this._logging.error(`[Templates] Failed to fetch templates from local repo '${this.config.name}'`, error);
      throw error;
    }
  }

  /**
   * Download file content from local filesystem
   */
  public async downloadTemplate(templateFile: AITemplateFile): Promise<string> {
    try {
      const fileUri = vscode.Uri.parse(templateFile.rawUrl);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      return Buffer.from(fileContent).toString("utf8");
    } catch (error) {
      console.error(`Error reading file '${templateFile.name}' from ${templateFile.rawUrl}:`, error);
      throw error;
    }
  }

  /**
   * Download the SKILL.md metadata file from a local skill directory.
   * Returns the file content, or null if the SKILL.md does not exist.
   */
  public async downloadSkillMetadataFile(templateFile: AITemplateFile): Promise<string | null> {
    if (!templateFile.isDirectory) {
      throw new Error(`Template is not a skill directory: ${templateFile.name}`);
    }

    const directoryUri = vscode.Uri.parse(templateFile.rawUrl);
    const skillMdUri = vscode.Uri.joinPath(directoryUri, "SKILL.md");

    this._logging.debug(`[Templates] Reading SKILL.md metadata from local filesystem`, {
      repository: templateFile.repository,
      skillName: templateFile.name,
      skillMdPath: skillMdUri.fsPath,
    });

    try {
      const fileContent = await vscode.workspace.fs.readFile(skillMdUri);
      return Buffer.from(fileContent).toString("utf8");
    } catch (error) {
      // File doesn't exist is a normal case - return null
      this._logging.debug(`[Templates] SKILL.md not found for local skill`, {
        repository: templateFile.repository,
        skillName: templateFile.name,
        skillMdPath: skillMdUri.fsPath,
      });
      return null;
    }
  }

  /**
   * Recursively download all files in a directory
   * Returns a map of relative file paths to their contents
   */
  public async downloadDirectoryContents(templateFile: AITemplateFile): Promise<Map<string, string>> {
    if (!templateFile.isDirectory) {
      throw new Error(`Template is not a directory: ${templateFile.name}`);
    }

    const fileContents = new Map<string, string>();
    const directoryUri = vscode.Uri.parse(templateFile.rawUrl);

    const downloadRecursive = async (currentUri: vscode.Uri, relativePath: string): Promise<void> => {
      try {
        const entries = await vscode.workspace.fs.readDirectory(currentUri);

        for (const [name, fileType] of entries) {
          const itemUri = vscode.Uri.joinPath(currentUri, name);
          const itemRelativePath = relativePath ? `${relativePath}/${name}` : name;

          if (fileType === vscode.FileType.File) {
            // Read file content
            const fileContent = await vscode.workspace.fs.readFile(itemUri);
            const content = Buffer.from(fileContent).toString("utf8");
            fileContents.set(itemRelativePath, content);
          } else if (fileType === vscode.FileType.Directory) {
            // Recursively process subdirectory
            await downloadRecursive(itemUri, itemRelativePath);
          }
        }
      } catch (error) {
        console.error(`Error reading directory '${currentUri.fsPath}':`, error);
        throw error;
      }
    };

    await downloadRecursive(directoryUri, "");
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
   * Get the resolved base path for this local folder repository.
   * This is useful for creating file watchers.
   */
  public async getResolvedBasePath(): Promise<vscode.Uri | undefined> {
    return this.resolveBasePath();
  }

  /**
   * Resolve the base path for the local folder repository.
   * Supports:
   * - Absolute paths: C:\templates, /home/user/templates
   * - Workspace-relative: ./templates, ../shared-templates
   * - Home directory: ~/templates
   */
  private async resolveBasePath(): Promise<vscode.Uri | undefined> {
    if (this.resolvedBasePath) {
      return this.resolvedBasePath;
    }

    const urlPath = this.config.url;

    // Handle home directory expansion (~/)
    if (urlPath.startsWith("~/") || urlPath.startsWith("~\\")) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) {
        throw new Error(`Could not resolve home directory for path: ${urlPath}`);
      }
      const expandedPath = path.join(homeDir, urlPath.slice(2));
      this.resolvedBasePath = vscode.Uri.file(expandedPath);
      return this.resolvedBasePath;
    }

    // Handle absolute paths
    if (path.isAbsolute(urlPath)) {
      this.resolvedBasePath = vscode.Uri.file(urlPath);
      return this.resolvedBasePath;
    }

    // Handle workspace-relative paths
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error(`No workspace folder found for relative path: ${urlPath}`);
    }

    // Handle relative paths (./templates or ../templates)
    const resolvedPath = path.resolve(workspaceFolder.uri.fsPath, urlPath);
    this.resolvedBasePath = vscode.Uri.file(resolvedPath);
    return this.resolvedBasePath;
  }

  /**
   * Validate that the base path exists and is accessible
   */
  public async validatePath(): Promise<{ valid: boolean; error?: string }> {
    try {
      const basePath = await this.resolveBasePath();
      if (!basePath) {
        return { valid: false, error: "Could not resolve base path" };
      }

      const stat = await vscode.workspace.fs.stat(basePath);
      if (stat.type !== vscode.FileType.Directory) {
        return { valid: false, error: "Path is not a directory" };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
