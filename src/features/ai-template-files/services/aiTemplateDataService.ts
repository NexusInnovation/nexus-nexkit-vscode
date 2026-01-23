import * as vscode from "vscode";
import { AITemplateFile, AITemplateFileType, InstalledTemplatesMap, RepositoryTemplatesMap } from "../models/aiTemplateFile";
import { RepositoryManager } from "./repositoryManager";
import { FetchAllResult, TemplateFetcherService } from "./templateFetcherService";
import { TemplateDataStore } from "./templateDataStore";
import { TemplateFileOperations, InstallOptions, BatchInstallSummary } from "./templateFileOperations";
import { InstalledTemplatesStateManager } from "./installedTemplatesStateManager";

/**
 * Main facade service for AI template data management
 * Provides a simple API for accessing template data with loading state management
 */
export class AITemplateDataService implements vscode.Disposable {
  private readonly repositoryManager: RepositoryManager;
  private readonly fetcherService: TemplateFetcherService;
  private readonly dataStore: TemplateDataStore;
  private readonly fileOperations: TemplateFileOperations;
  private readonly stateManager: InstalledTemplatesStateManager;

  private _isReady = false;
  private _isInitializing = false;
  private _readyPromise: Promise<void> | null = null;

  private readonly _onInitialized = new vscode.EventEmitter<void>();
  private readonly _onError = new vscode.EventEmitter<Error>();
  private configChangeListener: vscode.Disposable | undefined;
  private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Event fired when data is initialized and ready
   */
  public readonly onInitialized: vscode.Event<void> = this._onInitialized.event;

  /**
   * Event fired when data changes (forwarded from data store)
   */
  public readonly onDataChanged: vscode.Event<void>;

  /**
   * Event fired when an error occurs
   */
  public readonly onError: vscode.Event<Error> = this._onError.event;

  constructor(stateManager: InstalledTemplatesStateManager) {
    this.stateManager = stateManager;
    this.repositoryManager = new RepositoryManager();
    this.fetcherService = new TemplateFetcherService(this.repositoryManager);
    this.dataStore = new TemplateDataStore();
    this.fileOperations = new TemplateFileOperations(this.fetcherService, this.stateManager);

    // Forward data change events
    this.onDataChanged = this.dataStore.onDataChanged;
  }

  /**
   * Initialize the service - fetch all templates from configured repositories
   */
  public async initialize(): Promise<void> {
    // If already initializing, return the existing promise
    if (this._isInitializing && this._readyPromise) {
      return this._readyPromise;
    }

    // If already ready, return immediately
    if (this._isReady) {
      return Promise.resolve();
    }

    this._isInitializing = true;

    this._readyPromise = (async () => {
      try {
        // Initialize repositories
        this.repositoryManager.initialize();

        // Fetch all templates
        const result = await this.fetcherService.fetchFromAllRepositories();

        // Update data store
        this.dataStore.updateCollection(result.allTemplates);

        this._isReady = true;
        this._isInitializing = false;
        this._onInitialized.fire();

        console.log(
          `✅ AI Templates initialized: ${result.allTemplates.length} templates from ${result.successCount} repositories`
        );

        if (result.failureCount > 0) {
          console.warn(`⚠️ Failed to fetch from ${result.failureCount} repositories`);
        }

        // Setup file watchers for local repositories
        await this.setupFileWatchers();
      } catch (error) {
        this._isInitializing = false;
        const err = error instanceof Error ? error : new Error(String(error));
        this._onError.fire(err);
        console.error("Failed to initialize AI Templates:", error);
        throw error;
      }
    })();

    return this._readyPromise;
  }

  /**
   * Check if the service is ready
   */
  public isReady(): boolean {
    return this._isReady;
  }

  /**
   * Wait for the service to be ready
   */
  public async waitForReady(): Promise<void> {
    if (this._isReady) {
      return Promise.resolve();
    }

    if (this._readyPromise) {
      return this._readyPromise;
    }

    // Not initialized yet, initialize now
    return this.initialize();
  }

  /**
   * Refresh data from all repositories
   */
  public async refresh(): Promise<FetchAllResult | null> {
    try {
      // Reinitialize repositories (picks up config changes)
      this.repositoryManager.refresh();

      // Fetch all templates
      const result = await this.fetcherService.fetchFromAllRepositories();

      // Update data store
      this.dataStore.updateCollection(result.allTemplates);

      console.log(`🔄 AI Templates refreshed: ${result.allTemplates.length} templates`);

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this._onError.fire(err);
      console.error("Failed to refresh AI Templates:", error);
      throw error;
    }
  }

  /**
   * Get all templates
   */
  public getAllTemplates(): ReadonlyArray<AITemplateFile> {
    return this.dataStore.getAll();
  }

  /**
   * Get templates by repository name
   */
  public getTemplatesByRepository(repositoryName: string): ReadonlyArray<AITemplateFile> {
    return this.dataStore.getByRepository(repositoryName);
  }

  /**
   * Get templates by type
   */
  public getTemplatesByType(type: AITemplateFileType): ReadonlyArray<AITemplateFile> {
    return this.dataStore.getByType(type);
  }

  /**
   * Get templates by repository and type
   */
  public getTemplatesByRepositoryAndType(repositoryName: string, type: AITemplateFileType): ReadonlyArray<AITemplateFile> {
    return this.dataStore.getByRepositoryAndType(repositoryName, type);
  }

  /**
   * Get all repository names
   */
  public getRepositoryNames(): string[] {
    return this.dataStore.getRepositoryNames();
  }

  /**
   * Search templates by name
   */
  public searchTemplates(query: string): ReadonlyArray<AITemplateFile> {
    return this.dataStore.search(query);
  }

  /**
   * Install a template to the workspace
   */
  public async installTemplate(templateFile: AITemplateFile, options?: InstallOptions): Promise<boolean> {
    return this.fileOperations.installTemplate(templateFile, options);
  }

  /**
   * Uninstall a template from the workspace
   */
  public async uninstallTemplate(templateFile: AITemplateFile, silent?: boolean): Promise<void> {
    return this.fileOperations.uninstallTemplate(templateFile, silent);
  }

  /**
   * Get all installed templates
   */
  public getInstalledTemplates(): InstalledTemplatesMap {
    return this.fileOperations.getInstalledTemplates();
  }

  /**
   * Get repository templates map
   */
  public getRepositoryTemplatesMap(): RepositoryTemplatesMap[] {
    const allTemplates = this.dataStore.getAll();

    const result: Record<string, RepositoryTemplatesMap> = {};

    for (const template of allTemplates) {
      if (!result[template.repository]) {
        result[template.repository] = {
          name: template.repository,
          types: {
            agents: [],
            prompts: [],
            skills: [],
            instructions: [],
            chatmodes: [],
          },
        };
      }
      result[template.repository].types[template.type].push(template);
    }

    return Object.keys(result).map((repo) => result[repo]);
  }

  /**
   * Check if a template is installed
   */
  public isTemplateInstalled(templateFile: AITemplateFile): boolean {
    return this.fileOperations.isTemplateInstalled(templateFile);
  }

  /**
   * Sync installed templates state with filesystem
   * Removes orphaned entries where files were deleted externally
   * Should be called on extension activation and when panel opens
   */
  public async syncInstalledTemplates(): Promise<void> {
    try {
      await this.stateManager.syncWithFileSystem();
    } catch (error) {
      console.error("Failed to sync installed templates:", error);
    }
  }

  /**
   * Install multiple templates in batch
   */
  public async installBatch(templates: AITemplateFile[], options?: InstallOptions): Promise<BatchInstallSummary> {
    return this.fileOperations.installBatch(templates, options);
  }

  /**
   * Update all installed templates to their latest versions
   * First syncs with filesystem, then refetches and reinstalls all installed templates
   */
  public async updateInstalledTemplates(): Promise<BatchInstallSummary & { skipped: number }> {
    // First sync with filesystem to ensure state is current
    await this.syncInstalledTemplates();

    // Get all currently installed templates from state
    const installedRecords = this.stateManager.getInstalledTemplates();

    // Get all available templates from data store
    const allTemplates = this.dataStore.getAll();

    // Match installed records with current templates from repositories
    const templatesToUpdate: AITemplateFile[] = [];
    let skippedCount = 0;

    for (const record of installedRecords) {
      // Find matching template in available templates
      const matchingTemplate = allTemplates.find(
        (t) => t.name === record.name && t.type === record.type && t.repository === record.repository
      );

      if (matchingTemplate) {
        templatesToUpdate.push(matchingTemplate);
      } else {
        // Template no longer available in configured repositories - skip silently
        console.log(`[Update] Skipping template ${record.name} from ${record.repository} (no longer available)`);
        skippedCount++;
      }
    }

    // Install batch without backups (overwrite existing)
    const summary = await this.installBatch(templatesToUpdate, { silent: true, overwrite: true });

    return {
      ...summary,
      skipped: skippedCount,
    };
  }

  /**
   * Setup configuration change watcher
   */
  public setupConfigurationWatcher(): void {
    this.configChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
      // Check if repository configuration changed
      if (e.affectsConfiguration("nexkit.repositories")) {
        console.log("📝 Repository configuration changed, refreshing templates...");
        try {
          const result = await this.refresh();
          vscode.window.showInformationMessage(
            `AI Templates refreshed due to configuration change. ${result?.allTemplates.length ?? 0} template(s) loaded.`
          );

          // Recreate file watchers for new configuration
          await this.setupFileWatchers();
        } catch (error) {
          console.error("Failed to refresh after configuration change:", error);
        }
      }
    });
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.dataStore.dispose();
    this._onInitialized.dispose();
    this._onError.dispose();
    this.configChangeListener?.dispose();
    this.disposeFileWatchers();
  }

  /**
   * Setup file watchers for local folder repositories
   * Watches for .md file changes and automatically refreshes templates
   */
  private async setupFileWatchers(): Promise<void> {
    // Dispose existing watchers first
    this.disposeFileWatchers();

    const providers = this.repositoryManager.getAllProviders();

    for (const provider of providers) {
      // Only setup watchers for local folder repositories
      if (!(provider as any).getResolvedBasePath) {
        continue;
      }

      try {
        const basePath = await (provider as any).getResolvedBasePath();
        if (!basePath) {
          console.warn(`Could not resolve base path for ${provider.getRepositoryName()}, skipping file watcher`);
          continue;
        }

        // Create watcher pattern for markdown files
        const pattern = new vscode.RelativePattern(basePath, "**/*.md");
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        const repositoryName = provider.getRepositoryName();

        // Handle file creation
        watcher.onDidCreate(() => {
          this.scheduleRepositoryRefresh(repositoryName);
        });

        // Handle file changes
        watcher.onDidChange(() => {
          this.scheduleRepositoryRefresh(repositoryName);
        });

        // Handle file deletion
        watcher.onDidDelete(() => {
          this.scheduleRepositoryRefresh(repositoryName);
        });

        this.fileWatchers.set(repositoryName, watcher);
        console.log(`📁 File watcher setup for local repository: ${repositoryName}`);
      } catch (error) {
        console.error(`Failed to setup file watcher for ${provider.getRepositoryName()}:`, error);
      }
    }
  }

  /**
   * Dispose all file watchers and pending refresh timers
   */
  private disposeFileWatchers(): void {
    // Clear all pending refresh timers
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();

    // Dispose all file watchers
    for (const watcher of this.fileWatchers.values()) {
      watcher.dispose();
    }
    this.fileWatchers.clear();
  }

  /**
   * Schedule a debounced refresh for a specific repository
   * Multiple rapid file changes will only trigger one refresh
   */
  private scheduleRepositoryRefresh(repositoryName: string): void {
    // Clear existing timer for this repository
    const existingTimer = this.refreshTimers.get(repositoryName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new refresh with 500ms debounce
    const timer = setTimeout(async () => {
      this.refreshTimers.delete(repositoryName);
      await this.refreshRepository(repositoryName);
    }, 500);

    this.refreshTimers.set(repositoryName, timer);
  }

  /**
   * Refresh templates from a specific repository
   * Used by file watchers to update only changed repository
   */
  private async refreshRepository(repositoryName: string): Promise<void> {
    try {
      console.log(`🔄 Refreshing templates from repository: ${repositoryName}`);

      // Fetch templates from the specific repository
      const result = await this.fetcherService.fetchFromRepository(repositoryName);

      if (!result.success) {
        console.error(`Failed to refresh repository ${repositoryName}:`, result.error);
        return;
      }

      // Get all current templates
      const allTemplates = this.dataStore.getAll();

      // Remove old templates from this repository
      const otherTemplates = allTemplates.filter((t) => t.repository !== repositoryName);

      // Add new templates from this repository
      const updatedTemplates = [...otherTemplates, ...result.templates];

      // Update data store (this will fire onDataChanged event)
      this.dataStore.updateCollection(updatedTemplates);

      console.log(`✅ Repository ${repositoryName} refreshed: ${result.templates.length} template(s)`);
    } catch (error) {
      console.error(`Error refreshing repository ${repositoryName}:`, error);
      const err = error instanceof Error ? error : new Error(String(error));
      this._onError.fire(err);
    }
  }
}
