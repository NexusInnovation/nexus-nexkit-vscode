import { AITemplateFile } from "../models/aiTemplateFile";
import { RepositoryManager } from "./repositoryManager";
import { LoggingService } from "../../../shared/services/loggingService";

/**
 * Result of fetching templates from a single repository
 */
export interface RepositoryFetchResult {
  repositoryName: string;
  templates: AITemplateFile[];
  success: boolean;
  error?: Error;
}

/**
 * Result of fetching templates from all repositories
 */
export interface FetchAllResult {
  allTemplates: AITemplateFile[];
  results: RepositoryFetchResult[];
  successCount: number;
  failureCount: number;
}

/**
 * Service responsible for fetching templates from repositories
 * Handles parallel fetching, error aggregation, and progress tracking
 */
export class TemplateFetcherService {
  private readonly _logging = LoggingService.getInstance();

  constructor(private readonly repositoryManager: RepositoryManager) {}

  /**
   * Fetch templates from a specific repository
   */
  public async fetchFromRepository(repositoryName: string): Promise<RepositoryFetchResult> {
    const provider = this.repositoryManager.getProvider(repositoryName);

    if (!provider) {
      this._logging.error(`[Templates] Repository provider not found`, { repositoryName });
      return {
        repositoryName,
        templates: [],
        success: false,
        error: new Error(`Repository not found: ${repositoryName}`),
      };
    }

    try {
      const templates = await provider.fetchAllTemplates();

      this._logging.info(`[Templates] Repository fetched`, {
        repositoryName,
        templateCount: templates.length,
      });

      return {
        repositoryName,
        templates,
        success: true,
      };
    } catch (error) {
      this._logging.error(`[Templates] Repository fetch failed`, {
        repositoryName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        repositoryName,
        templates: [],
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Fetch templates from all repositories in parallel
   */
  public async fetchFromAllRepositories(): Promise<FetchAllResult> {
    const providers = this.repositoryManager.getAllProviders();

    if (providers.length === 0) {
      this._logging.warn(`[Templates] No enabled repositories configured`);
      return {
        allTemplates: [],
        results: [],
        successCount: 0,
        failureCount: 0,
      };
    }

    this._logging.info(`[Templates] Fetching templates from ${providers.length} repository(ies)`);

    // Fetch from all repositories in parallel
    const fetchPromises = providers.map((provider) => this.fetchFromRepository(provider.getRepositoryName()));

    const results = await Promise.all(fetchPromises);

    // Aggregate results
    const allTemplates: AITemplateFile[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const result of results) {
      if (result.success) {
        allTemplates.push(...result.templates);
        successCount++;
      } else {
        failureCount++;
        this._logging.error(`[Templates] Failed to fetch from repository '${result.repositoryName}'`, result.error);
      }
    }

    this._logging.info(`[Templates] Fetch completed`, {
      repositoryCount: providers.length,
      successCount,
      failureCount,
      templateCount: allTemplates.length,
    });

    return {
      allTemplates,
      results,
      successCount,
      failureCount,
    };
  }

  /**
   * Download template content
   */
  public async downloadTemplate(templateFile: AITemplateFile): Promise<string> {
    const provider = this.repositoryManager.getProvider(templateFile.repository);

    if (!provider) {
      throw new Error(`Repository not found: ${templateFile.repository}`);
    }

    return await provider.downloadTemplate(templateFile);
  }

  /**
   * Download directory contents recursively (for skills)
   */
  public async downloadDirectoryContents(templateFile: AITemplateFile): Promise<Map<string, string>> {
    const provider = this.repositoryManager.getProvider(templateFile.repository);

    if (!provider) {
      throw new Error(`Repository not found: ${templateFile.repository}`);
    }

    return await provider.downloadDirectoryContents(templateFile);
  }
}
