import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Service for managing workspace initialization events
 * Provides event emitter for workspace initialization completion
 */
export class WorkspaceInitializationService {
  private readonly _onWorkspaceInitializedEmitter = new vscode.EventEmitter<void>();
  public readonly onWorkspaceInitialized: vscode.Event<void> = this._onWorkspaceInitializedEmitter.event;

  /**
   * Fire the workspace initialized event
   * Should be called after workspace initialization completes
   */
  public notifyWorkspaceInitialized(): void {
    this._onWorkspaceInitializedEmitter.fire();
  }

  public async initializeWorkspace(workspaceFolder: vscode.WorkspaceFolder, services: ServiceContainer) {
    // Backup and delete existing GitHub template folders if they exist
    const backupPath = await services.backup.backupTemplates(workspaceFolder.uri.fsPath);

    // Deploy configuration files
    await services.gitIgnoreConfigDeployer.deployGitignore(workspaceFolder.uri.fsPath);
    await services.recommendedExtensionsConfigDeployer.deployVscodeExtensions(workspaceFolder.uri.fsPath);
    await services.recommendedSettingsConfigDeployer.deployVscodeSettings(workspaceFolder.uri.fsPath);
    await services.mcpConfigDeployer.deployWorkspaceMCPServers(workspaceFolder.uri.fsPath);

    // Deploy default template files (agents, prompts, chatmodes) from the Nexus Templates
    const deploymentSummary = await services.aiTemplateFilesDeployer.deployTemplateFiles();

    // Update workspace settings
    await SettingsManager.setWorkspaceInitialized(true);

    // Notify listeners that workspace was initialized
    services.workspaceInitialization.notifyWorkspaceInitialized();

    return { deploymentSummary, backupPath };
  }
}
