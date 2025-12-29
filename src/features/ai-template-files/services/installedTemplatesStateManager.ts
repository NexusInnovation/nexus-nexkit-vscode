import * as vscode from "vscode";
import * as path from "path";
import { AITemplateFile, AITemplateFileType, AI_TEMPLATE_FILE_TYPES } from "../models/aiTemplateFile";
import { InstalledTemplateRecord, InstalledTemplatesState } from "../models/installedTemplateRecord";
import { fileExists, getWorkspaceRoot } from "../../../shared/utils/fileHelper";

/**
 * Service for managing installed templates state
 * This is the source of truth for which templates are installed
 */
export class InstalledTemplatesStateManager {
  private static readonly STATE_KEY = "nexkit.installedTemplates";

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Get all installed templates from workspace state
   */
  public getInstalledTemplates(): InstalledTemplateRecord[] {
    const state = this.getState();
    return state.templates;
  }

  /**
   * Add a template to the installed state
   */
  public async addInstalledTemplate(template: AITemplateFile): Promise<void> {
    const state = this.getState();

    // Check if already installed
    const existingIndex = state.templates.findIndex(
      (t) => t.name === template.name && t.type === template.type && t.repository === template.repository
    );

    const record: InstalledTemplateRecord = {
      name: template.name,
      type: template.type,
      repository: template.repository,
      repositoryUrl: template.repositoryUrl,
      rawUrl: template.rawUrl,
      installedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      // Update existing record
      state.templates[existingIndex] = record;
    } else {
      // Add new record
      state.templates.push(record);
    }

    await this.setState(state);
  }

  /**
   * Remove a template from the installed state
   */
  public async removeInstalledTemplate(template: AITemplateFile): Promise<void> {
    const state = this.getState();

    // Remove matching template
    state.templates = state.templates.filter(
      (t) => !(t.name === template.name && t.type === template.type && t.repository === template.repository)
    );

    await this.setState(state);
  }

  /**
   * Check if a specific template is installed
   */
  public isTemplateInstalled(template: AITemplateFile): boolean {
    const state = this.getState();
    return state.templates.some(
      (t) => t.name === template.name && t.type === template.type && t.repository === template.repository
    );
  }

  /**
   * Sync state with filesystem - remove templates that no longer exist on disk
   * This is called on extension activation and when panel opens
   */
  public async syncWithFileSystem(): Promise<void> {
    const state = this.getState();
    const workspaceRoot = getWorkspaceRoot();
    const templatesToKeep: InstalledTemplateRecord[] = [];

    // Check each installed template if file still exists
    for (const template of state.templates) {
      const filePath = path.join(workspaceRoot, ".github", template.type, template.name);

      if (await fileExists(filePath)) {
        templatesToKeep.push(template);
      } else {
        // File was deleted externally - silently remove from state
        console.log(`[Sync] Removed orphaned template from state: ${template.name} (${template.repository})`);
      }
    }

    // Update state with only existing templates
    state.templates = templatesToKeep;
    state.lastSyncedAt = Date.now();

    await this.setState(state);
  }

  /**
   * Get installed templates organized by type (for webview compatibility)
   * Returns map of type -> array of template names
   */
  public getInstalledTemplatesMap(): Record<AITemplateFileType, string[]> {
    const state = this.getState();
    const map: Record<AITemplateFileType, string[]> = {
      agents: [],
      prompts: [],
      instructions: [],
      chatmodes: [],
    };

    for (const template of state.templates) {
      if (!map[template.type].includes(template.name)) {
        map[template.type].push(template.name);
      }
    }

    return map;
  }

  /**
   * Get installed templates for a specific repository and type
   */
  public getInstalledTemplatesByRepoAndType(repository: string, type: AITemplateFileType): InstalledTemplateRecord[] {
    const state = this.getState();
    return state.templates.filter((t) => t.repository === repository && t.type === type);
  }

  /**
   * Clear all installed templates state (for testing/reset)
   */
  public async clearState(): Promise<void> {
    await this.setState({
      templates: [],
      lastSyncedAt: Date.now(),
    });
  }

  /**
   * Get the current state from workspace storage
   */
  private getState(): InstalledTemplatesState {
    const state = this.context.workspaceState.get<InstalledTemplatesState>(InstalledTemplatesStateManager.STATE_KEY);

    if (!state) {
      return {
        templates: [],
        lastSyncedAt: 0,
      };
    }

    return state;
  }

  /**
   * Save state to workspace storage
   */
  private async setState(state: InstalledTemplatesState): Promise<void> {
    await this.context.workspaceState.update(InstalledTemplatesStateManager.STATE_KEY, state);
  }
}
