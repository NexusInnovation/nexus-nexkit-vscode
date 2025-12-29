import { RepositoryConfig, RepositoryConfigManager } from "../models/repositoryConfig";
import { RepositoryTemplateProvider } from "../providers/repositoryTemplateProvider";

/**
 * Manages repository instances and their lifecycle
 */
export class RepositoryManager {
  private providers: Map<string, RepositoryTemplateProvider> = new Map();

  /**
   * Initialize repository providers from configuration
   */
  public initialize(): void {
    this.providers.clear();
    const repositories = RepositoryConfigManager.getEnabledRepositories();

    for (const config of repositories) {
      try {
        const provider = new RepositoryTemplateProvider(config);
        this.providers.set(config.name, provider);
      } catch (error) {
        console.error(`Failed to create provider for ${config.name}:`, error);
      }
    }
  }

  /**
   * Get a repository provider by name
   */
  public getProvider(repositoryName: string): RepositoryTemplateProvider | undefined {
    return this.providers.get(repositoryName);
  }

  /**
   * Get all repository providers
   */
  public getAllProviders(): RepositoryTemplateProvider[] {
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
