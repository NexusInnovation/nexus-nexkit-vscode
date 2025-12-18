import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { fileExists, getWorkspaceRoot } from "../../shared/utils/fileHelper";
import { AI_TEMPLATE_FILE_TYPES, AITemplateFile, AITemplateFileType } from "./aiTemplateFile";
import { RepositoryTemplateConfig, RepositoryTemplateConfigManager } from "./repositoryTemplateConfigManagerService";
import { RepositoryTemplateService } from "./repositoryTemplateService";

/**
 * Map of installed templates organized by type in the workspace
 */
export type InstalledTemplatesMap = Record<AITemplateFileType, string[]>;

/**
 * Service to fetch and download AI template files from configured GitHub repositories
 */
export class AITemplateFilesManagerService {
  private instances: Map<string, RepositoryTemplateService> = new Map();

  constructor() {
    this.initializeInstances();
  }

  /**
   * Initialize repository instances from configuration
   */
  private initializeInstances(): void {
    const repositories = RepositoryTemplateConfigManager.getEnabledRepositories();

    for (const config of repositories) {
      const instance = this.createInstance(config);
      if (instance) {
        this.instances.set(config.name, instance);
      }
    }
  }

  /**
   * Create a repository instance based on configuration
   */
  private createInstance(config: RepositoryTemplateConfig): RepositoryTemplateService | null {
    try {
      return new RepositoryTemplateService(config);
    } catch (error) {
      console.error(`Failed to create instance for ${config.name}:`, error);
      return null;
    }
  }

  /**
   * Get a repository instance by name, throwing if not found
   */
  private getRepository(repositoryKey: string): RepositoryTemplateService {
    const instance = this.instances.get(repositoryKey);
    if (!instance) {
      throw new Error(
        `Repository not found: "${repositoryKey}". Available repositories: ${this.getRepositoryNames().join(", ")}`
      );
    }
    return instance;
  }

  /**
   * Fetch ai template files from a specific repository
   */
  public async fetchTemplates(repositoryKey: string): Promise<AITemplateFile[]> {
    const instance = this.getRepository(repositoryKey);
    return await instance.fetchAllTemplates();
  }

  /**
   * Fetch all ai templates files from all repositories at once. Returns templates grouped by repository name.
   */
  public async fetchAllTemplates(): Promise<{ [repoName: string]: AITemplateFile[] }> {
    const repositoryTemplates: { [repoName: string]: AITemplateFile[] } = {};

    const fetchPromises = Array.from(this.instances.entries()).map(async ([name, instance]) => {
      try {
        repositoryTemplates[name] = await instance.fetchAllTemplates();
      } catch (error) {
        console.error(`Error fetching items from ${name}:`, error);
        // Continue with other repositories even if one fails
      }
    });

    await Promise.all(fetchPromises);

    return repositoryTemplates;
  }

  /**
   * Download template from a specific repository
   */
  private async downloadTemplate(templateFile: AITemplateFile): Promise<string> {
    return await this.getRepository(templateFile.repository).downloadTemplate(templateFile);
  }

  /**
   * Clear cache for a specific repository
   */
  public clearCache(repositoryKey: string): void {
    this.getRepository(repositoryKey).clearCache();
  }

  /**
   * Clear all repository caches
   */
  public clearAllCaches(): void {
    for (const instance of this.instances.values()) {
      instance.clearCache();
    }
  }

  /**
   * Get all configured repository names
   */
  public getRepositoryNames(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Get the directory path for a type of template
   */
  private getTemplateTypePath(templateFileType: AITemplateFileType): string {
    const workspaceRoot = getWorkspaceRoot();
    return path.join(workspaceRoot, ".github", templateFileType);
  }

  /**
   * Get all installed items organized by category
   */
  public async getInstalledItems(): Promise<InstalledTemplatesMap> {
    const installed: InstalledTemplatesMap = {
      agents: [],
      prompts: [],
      instructions: [],
      chatmodes: [],
    };

    for (const type of AI_TEMPLATE_FILE_TYPES) {
      try {
        const dirPath = this.getTemplateTypePath(type);
        if (await fileExists(dirPath)) {
          const files = await fs.promises.readdir(dirPath);
          files.forEach((file) => {
            if (file.endsWith(".md")) {
              installed[type].push(file);
            }
          });
        }
      } catch (error) {
        console.error(`Error scanning ${type} directory:`, error);
        // Continue with other categories
      }
    }

    return installed;
  }

  /**
   * Install a template from a repository item
   * @param silent If true, suppress user-facing notifications
   */
  async installTemplate(templateFile: AITemplateFile, silent: boolean = false): Promise<void> {
    try {
      const dirPath = this.getTemplateTypePath(templateFile.type);
      const filePath = path.join(dirPath, templateFile.name);

      // Create directory if it doesn't exist
      await fs.promises.mkdir(dirPath, { recursive: true });

      // Download file content
      const content = await this.downloadTemplate(templateFile);

      // Write file (overwrites if it already exists)
      await fs.promises.writeFile(filePath, content, "utf8");

      if (!silent) {
        vscode.window.showInformationMessage(`Installed "${templateFile.name}" from '${templateFile.repository}'`);
      }
    } catch (error) {
      console.error(`Failed to install ${templateFile.name}:`, error);
      if (!silent) {
        vscode.window.showErrorMessage(`Failed to install ${templateFile.name}: ${error}`);
      }
      throw error;
    }
  }

  /**
   * Uninstall a template by removing it from the workspace
   */
  async uninstallItem(templateFile: AITemplateFile): Promise<void> {
    try {
      const filePath = path.join(this.getTemplateTypePath(templateFile.type), templateFile.name);
      // Check if file exists
      if (!(await fileExists(filePath))) {
        vscode.window.showWarningMessage(`File ${templateFile.name} not found in .github/${templateFile.type}/`);
        return;
      }

      // Delete file
      await fs.promises.unlink(filePath);

      vscode.window.showInformationMessage(`Removed ${templateFile.name} from .github/${templateFile.type}/`);
    } catch (error) {
      console.error(`Failed to remove ${templateFile.name}:`, error);
      vscode.window.showErrorMessage(`Failed to remove ${templateFile.name}: ${error}`);
      throw error;
    }
  }
}
