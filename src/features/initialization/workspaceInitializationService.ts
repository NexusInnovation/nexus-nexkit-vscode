import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { BatchInstallSummary } from "../ai-template-files/services/templateFileOperations";

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

  public async initializeWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
    profileName: string | null,
    services: ServiceContainer
  ) {
    // Run shared verification checks (gitignore, settings, file migration)
    // Delegates to StartupVerificationService — same checks that run at every startup.
    // Returns migration summary for initialization reporting.
    const migrationSummary = await services.startupVerification.verifyWorkspaceConfiguration(workspaceFolder.uri.fsPath);

    // Backup and delete existing .nexkit template folders if they exist
    const backupPath = await services.backup.backupTemplates(workspaceFolder.uri.fsPath);

    // Deploy init-only configuration files
    await services.recommendedExtensionsConfigDeployer.deployVscodeExtensions(workspaceFolder.uri.fsPath);
    await services.mcpConfigDeployer.deployWorkspaceMCPServers(workspaceFolder.uri.fsPath);

    let deploymentSummary: BatchInstallSummary | null = null;

    // Apply selected profile or use default behavior
    if (profileName) {
      // User selected a profile - apply it (explicitly create backup during initialization)
      const { summary } = await services.profileService.applyProfile(profileName, false);
      deploymentSummary = summary;
    } else {
      // User skipped or no profiles exist - deploy default template files (agents, prompts, chatmodes) from the Nexus Templates
      deploymentSummary = await services.aiTemplateFilesDeployer.deployTemplateFiles();
    }

    // Update workspace settings
    await SettingsManager.setWorkspaceInitialized(true);

    // Notify listeners that workspace was initialized
    services.workspaceInitialization.notifyWorkspaceInitialized();

    return { deploymentSummary, backupPath, migrationSummary };
  }
}
