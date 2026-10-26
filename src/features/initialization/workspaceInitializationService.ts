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

  public async initializeWorkspace(workspaceFolder: vscode.WorkspaceFolder, services: ServiceContainer): Promise<void> {
    // Run shared verification checks (git exclude, settings, hooks).
    // Delegates to StartupVerificationService — same checks that run at every startup.
    await services.startupVerification.verifyWorkspaceConfiguration(workspaceFolder.uri.fsPath);

    // Deploy recommended user-level chat settings — sanctioned settings.json write entry point.
    // Gated behind the confirmation dialog (see #162): only writes when the user accepts.
    const chatSettingsConfirmation = await services.confirmation.confirm(
      "Nexkit wants to update your VS Code chat settings",
      "Nexkit will update your user-level (global) VS Code chat settings (chat locations and the Nexus plugin marketplace). Your workspace settings.json is never modified.",
      SettingsManager.CONFIRMATION_KEYS.CHAT_SETTINGS
    );
    if (chatSettingsConfirmation === "accepted") {
      await services.recommendedSettingsConfigDeployer.deployVscodeSettings(workspaceFolder.uri.fsPath, "initialization");
    }

    // Deploy init-only workspace configuration files
    await services.recommendedExtensionsConfigDeployer.deployVscodeExtensions(workspaceFolder.uri.fsPath);
    await services.mcpConfigDeployer.deployWorkspaceMCPServers(workspaceFolder.uri.fsPath);

    // Update workspace settings
    await SettingsManager.setWorkspaceInitialized(true);

    // Notify listeners that workspace was initialized
    services.workspaceInitialization.notifyWorkspaceInitialized();
  }
}
