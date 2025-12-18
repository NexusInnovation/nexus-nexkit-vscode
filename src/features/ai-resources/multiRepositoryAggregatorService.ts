import { GitHubRepositoryService, RepositoryItem } from "./gitHubRepositoryService";
import { RepositoryConfigManager, InternalRepositoryConfig } from "./repositoryConfigManager";

/**
 * Aggregates items from multiple github repository sources.
 * Provides unified interface for fetching content from all configured repositories
 */
export class MultiRepositoryAggregatorService {
  private services: Map<string, GitHubRepositoryService> = new Map();

  constructor() {
    this.initializeServices();
  }

  /**
   * Initialize repository services from configuration
   */
  private initializeServices(): void {
    const repositories = RepositoryConfigManager.getEnabledRepositories();

    for (const config of repositories) {
      const service = this.createService(config);
      if (service) {
        this.services.set(config.url, service);
      }
    }
  }

  /**
   * Create a repository service based on configuration
   */
  private createService(config: InternalRepositoryConfig): GitHubRepositoryService | null {
    try {
      return new GitHubRepositoryService({
        name: config.name,
        url: config.url,
        branch: config.branch,
        paths: config.paths,
      });
    } catch (error) {
      console.error(`Failed to create service for ${config.name}:`, error);
      return null;
    }
  }

  /**
   * Fetch all items from all repositories at once. Returns items grouped by repository name
   */
  async fetchAllItemsFromAllRepositories(): Promise<{ [repoName: string]: RepositoryItem[] }> {
    const repositoryItems: { [repoName: string]: RepositoryItem[] } = {};

    const fetchPromises = Array.from(this.services.values()).map(async (service) => {
      try {
        repositoryItems[service.getRepositoryName()] = await service.fetchAllItems();
      } catch (error) {
        console.error(`Error fetching items from ${service.getRepositoryName()}:`, error);
        // Continue with other repositories even if one fails
      }
    });

    await Promise.all(fetchPromises);

    return repositoryItems;
  }

  /**
   * Download file from a specific repository
   */
  async downloadFile(repositoryItem: RepositoryItem): Promise<string> {
    const service = this.services.get(repositoryItem.repositoryUrl);

    if (!service) {
      throw new Error(`No service found for repository: ${repositoryItem.repository}`);
    }

    return await service.downloadFile(repositoryItem);
  }

  /**
   * Clear all repository caches
   */
  clearAll(): void {
    this.services.clear();
  }

  /**
   * Get all configured repository names
   */
  getRepositoryNames(): string[] {
    return Array.from(this.services.values()).map((s) => s.getRepositoryName());
  }
}
