import * as vscode from "vscode";
import * as path from "path";
import { AITemplateFile, AITemplateFileType } from "../models/aiTemplateFile";
import { RepositoryConfig } from "../models/repositoryConfig";

/**
 * Provider for fetching templates from a local folder.
 * Handles path resolution (absolute, relative, home directory) and local filesystem operations.
 */
export class LocalFolderTemplateProvider {
  private resolvedBasePath: vscode.Uri | undefined;

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
              console.warn(`Path not found in ${this.config.name}: ${fullPath.fsPath}`);
              return;
            }

            // Read directory contents
            const entries = await vscode.workspace.fs.readDirectory(fullPath);

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
            }
          } catch (error) {
            console.error(`Error fetching ${type} from ${this.config.name}:`, error);
            throw error;
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
