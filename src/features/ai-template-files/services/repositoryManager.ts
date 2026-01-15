import { RepositoryConfig, RepositoryConfigManager } from "../models/repositoryConfig";
import { RepositoryTemplateProvider } from "../providers/repositoryTemplateProvider";
import { LocalFolderTemplateProvider } from "../providers/localFolderTemplateProvider";

/**
 * Union type for all template provider types
 */
type TemplateProvider = RepositoryTemplateProvider | LocalFolderTemplateProvider;

/**
 * Manages repository instances and their lifecycle
 */
export class RepositoryManager {
  private providers: Map<string, TemplateProvider> = new Map();

  /**
   * Initialize repository providers from configuration
   */
  public initialize(): void {
    this.providers.clear();
    const repositories = RepositoryConfigManager.getEnabledRepositories();

    for (const config of repositories) {
      try {
        const provider = this.createProvider(config);
        this.providers.set(config.name, provider);
      } catch (error) {
        console.error(`Failed to create provider for ${config.name}:`, error);
      }
    }
  }

  /**
   * Create appropriate provider based on repository type
   */
  private createProvider(config: RepositoryConfig): TemplateProvider {
    const type = config.type || "github";

    if (type === "local") {
      return new LocalFolderTemplateProvider(config);
    } else {
      return new RepositoryTemplateProvider(config);
    }
  }

  /**
   * Get a repository provider by name
   */
  public getProvider(repositoryName: string): TemplateProvider | undefined {
    return this.providers.get(repositoryName);
  }

  /**
   * Get all repository providers
   */
  public getAllProviders(): TemplateProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all repository names
   */
  public getRepositoryNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a repository exists
   */
  public hasRepository(repositoryName: string): boolean {
    return this.providers.has(repositoryName);
  }

  /**
   * Get count of repositories
   */
  public getRepositoryCount(): number {
    return this.providers.size;
  }

  /**
   * Refresh repositories (reload from configuration)
   */
  public refresh(): void {
    this.initialize();
  }

  /**
   * Clear all providers
   */
  public clear(): void {
    this.providers.clear();
  }
}
