/// <reference lib="dom" />

/**
 * Template Service for managing AI template files in the webview
 * Handles communication with the extension and maintains template state
 */

export interface TemplateFileData {
  name: string;
  type: string;
  rawUrl: string;
  repository: string;
  repositoryUrl: string;
}

export interface RepositoryTemplateData {
  name: string;
  url: string;
  types: {
    agents: TemplateFileData[];
    prompts: TemplateFileData[];
    instructions: TemplateFileData[];
    chatmodes: TemplateFileData[];
  };
}

export interface InstalledTemplatesMap {
  agents: string[];
  prompts: string[];
  instructions: string[];
  chatmodes: string[];
}

type TemplateDataUpdateCallback = (repositories: RepositoryTemplateData[]) => void;
type InstalledTemplatesUpdateCallback = (installed: InstalledTemplatesMap) => void;

/**
 * Service for managing template data and operations
 */
export class TemplateService {
  private vscode: any;
  private templateDataCallbacks: TemplateDataUpdateCallback[] = [];
  private installedTemplatesCallbacks: InstalledTemplatesUpdateCallback[] = [];

  // Cached data
  private repositories: RepositoryTemplateData[] = [];
  private installedTemplates: InstalledTemplatesMap = {
    agents: [],
    prompts: [],
    instructions: [],
    chatmodes: [],
  };

  constructor(vscode: any) {
    this.vscode = vscode;
  }

  /**
   * Initialize the service and set up message listeners
   */
  public initialize(): void {
    window.addEventListener("message", (event) => {
      const message = event.data;

      if (message.command === "templateDataUpdate") {
        this.repositories = message.repositories;
        this.notifyTemplateDataUpdate();
      } else if (message.command === "installedTemplatesUpdate") {
        this.installedTemplates = message.installed;
        this.notifyInstalledTemplatesUpdate();
      }
    });
  }

  /**
   * Load template data from extension
   */
  public loadTemplates(): void {
    this.vscode.postMessage({ command: "getTemplateData" });
  }

  /**
   * Refresh installed templates list
   */
  public refreshInstalledTemplates(): void {
    this.vscode.postMessage({ command: "getInstalledTemplates" });
  }

  /**
   * Install a template
   */
  public async installTemplate(template: TemplateFileData): Promise<void> {
    this.vscode.postMessage({
      command: "installTemplate",
      template,
    });
  }

  /**
   * Uninstall a template
   */
  public async uninstallTemplate(template: TemplateFileData): Promise<void> {
    this.vscode.postMessage({
      command: "uninstallTemplate",
      template,
    });
  }

  /**
   * Check if a template is installed
   */
  public isTemplateInstalled(template: TemplateFileData): boolean {
    const installedList = this.installedTemplates[template.type as keyof InstalledTemplatesMap] || [];
    return installedList.includes(template.name);
  }

  /**
   * Get cached repositories
   */
  public getRepositories(): RepositoryTemplateData[] {
    return this.repositories;
  }

  /**
   * Get cached installed templates
   */
  public getInstalledTemplates(): InstalledTemplatesMap {
    return this.installedTemplates;
  }

  /**
   * Subscribe to template data updates
   */
  public onTemplateDataUpdate(callback: TemplateDataUpdateCallback): void {
    this.templateDataCallbacks.push(callback);
  }

  /**
   * Subscribe to installed templates updates
   */
  public onInstalledTemplatesUpdate(callback: InstalledTemplatesUpdateCallback): void {
    this.installedTemplatesCallbacks.push(callback);
  }

  /**
   * Notify all subscribers of template data update
   */
  private notifyTemplateDataUpdate(): void {
    this.templateDataCallbacks.forEach((callback) => callback(this.repositories));
  }

  /**
   * Notify all subscribers of installed templates update
   */
  private notifyInstalledTemplatesUpdate(): void {
    this.installedTemplatesCallbacks.forEach((callback) => callback(this.installedTemplates));
  }
}
