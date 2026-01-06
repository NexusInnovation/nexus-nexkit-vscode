import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { Commands } from "../../shared/constants/commands";
import { WebviewMessage, ExtensionMessage } from "./types/webviewMessages";
import { ServiceContainer } from "../../core/serviceContainer";

/**
 * Handles message processing and business logic for the Nexkit panel webview
 *
 * This class acts as a bridge between:
 * - The webview UI (Preact components)
 * - The extension backend services (AITemplateDataService, TelemetryService, etc.)
 *
 * Message Flow:
 * 1. Webview sends message → handleMessage() routes to appropriate handler
 * 2. Handler processes request using backend services
 * 3. Handler sends response back to webview via sendMessage()
 */
export class NexkitPanelMessageHandler {
  private readonly _messageHandlers: Map<string, (message: WebviewMessage) => Promise<void>>;

  constructor(
    private readonly getWebview: () => vscode.WebviewView | undefined,
    private readonly _services: ServiceContainer
  ) {
    this._messageHandlers = new Map([
      ["webviewReady", this.handleWebviewReady.bind(this)],
      ["initWorkspace", this.handleInitWorkspace.bind(this)],
      ["getTemplateData", this.handleGetTemplateData.bind(this)],
      ["installTemplate", this.handleInstallTemplate.bind(this)],
      ["uninstallTemplate", this.handleUninstallTemplate.bind(this)],
      ["updateInstalledTemplates", this.handleUpdateInstalledTemplates.bind(this)],
      ["getTemplateMetadata", this.handleGetTemplateMetadata.bind(this)],
      ["applyProfile", this.handleApplyProfile.bind(this)],
      ["deleteProfile", this.handleDeleteProfile.bind(this)],
    ]);

    // Auto-refresh template data when it changes (e.g., after config update)
    this._services.aiTemplateData.onDataChanged(() => this.sendTemplateData());

    // Auto-refresh profiles when they change (e.g., after save/apply/delete)
    this._services.profileService.onProfilesChanged(() => this.sendProfilesData());

    // Auto-refresh all data when workspace is initialized
    this._services.workspaceInitialization.onWorkspaceInitialized(() => this.initialize());
  }

  public async handleMessage(message: WebviewMessage): Promise<void> {
    const handler = this._messageHandlers.get(message.command);
    if (handler) {
      await handler(message);
    } else {
      console.warn(`[Nexkit] Unknown webview command: ${message.command}`);
    }
  }

  public async initialize(): Promise<void> {
    this.sendWorkspaceState();
    await this.sendTemplateData();
    await this._services.aiTemplateData.syncInstalledTemplates();
    this.sendInstalledTemplates();
    this.sendProfilesData();
  }

  // ============================================================================
  // MESSAGE HANDLERS - Process webview requests
  // ============================================================================

  private async handleWebviewReady(message: WebviewMessage): Promise<void> {
    await this.initialize();
  }

  private async handleInitWorkspace(message: WebviewMessage): Promise<void> {
    this.trackWebviewAction("initWorkspace");
    await vscode.commands.executeCommand(Commands.INIT_WORKSPACE);
    this.sendWorkspaceState();
    this.sendInstalledTemplates();
  }

  private async handleGetTemplateData(message: WebviewMessage): Promise<void> {
    await this.sendTemplateData();
  }

  private async handleInstallTemplate(message: WebviewMessage & { command: "installTemplate" }): Promise<void> {
    this.trackWebviewAction("installTemplate");
    try {
      await this._services.aiTemplateData.installTemplate(message.template);
      this.sendInstalledTemplates();
    } catch (error) {
      console.error("Failed to install template:", error);
    }
  }

  private async handleUninstallTemplate(message: WebviewMessage & { command: "uninstallTemplate" }): Promise<void> {
    this.trackWebviewAction("uninstallTemplate");
    try {
      await this._services.aiTemplateData.uninstallTemplate(message.template);
      this.sendInstalledTemplates();
    } catch (error) {
      console.error("Failed to uninstall template:", error);
    }
  }

  private async handleUpdateInstalledTemplates(message: WebviewMessage & { command: "updateInstalledTemplates" }): Promise<void> {
    this.trackWebviewAction("updateInstalledTemplates");
    await vscode.commands.executeCommand(Commands.UPDATE_INSTALLED_TEMPLATES);
    this.sendInstalledTemplates();
  }

  private async handleGetTemplateMetadata(message: WebviewMessage & { command: "getTemplateMetadata" }): Promise<void> {
    try {
      const metadata = await this._services.templateMetadata.getMetadata(message.template);
      this.sendToWebview({
        command: "templateMetadataResponse",
        template: message.template,
        metadata,
      });
    } catch (error) {
      console.error("Failed to get template metadata:", error);
      this.sendToWebview({
        command: "templateMetadataResponse",
        template: message.template,
        metadata: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleApplyProfile(message: WebviewMessage & { command: "applyProfile" }): Promise<void> {
    this.trackWebviewAction("applyProfile");
    await vscode.commands.executeCommand(Commands.APPLY_PROFILE, message.profile);
    this.sendInstalledTemplates();
    this.sendProfilesData();
  }

  private async handleDeleteProfile(message: WebviewMessage & { command: "deleteProfile" }): Promise<void> {
    this.trackWebviewAction("deleteProfile");
    await vscode.commands.executeCommand(Commands.DELETE_PROFILE, message.profile);
    this.sendProfilesData();
  }

  private sendWorkspaceState(): void {
    const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    const isInitialized = SettingsManager.isWorkspaceInitialized();

    this.sendToWebview({
      command: "workspaceStateUpdate",
      hasWorkspace,
      isInitialized,
    });
  }

  private async sendTemplateData(): Promise<void> {
    try {
      await this._services.aiTemplateData.waitForReady();
      this.sendToWebview({
        command: "templateDataUpdate",
        repositories: this._services.aiTemplateData.getRepositoryTemplatesMap(),
      });
    } catch (error) {
      console.error("Failed to fetch template data:", error);
      vscode.window.showErrorMessage(`Failed to load template data: ${error}`);
    }
  }

  private sendInstalledTemplates(): void {
    try {
      this.sendToWebview({
        command: "installedTemplatesUpdate",
        installed: this._services.aiTemplateData.getInstalledTemplates(),
      });
    } catch (error) {
      console.error("Failed to fetch installed templates:", error);
    }
  }

  private sendProfilesData(): void {
    try {
      const profiles = this._services.profileService.getProfiles();
      this.sendToWebview({
        command: "profilesUpdate",
        profiles,
      });
    } catch (error) {
      console.error("Failed to fetch profiles:", error);
    }
  }

  /**
   * Sends a message to the webview
   */
  private sendToWebview(message: ExtensionMessage): void {
    const view = this.getWebview();
    if (view) {
      view.webview.postMessage(message);
    }
  }

  /**
   * Tracks telemetry for user actions in the webview
   */
  private trackWebviewAction(actionName: string): void {
    this._services.telemetry.trackEvent("ui.button.clicked", {
      buttonName: actionName,
      source: "webview",
    });
  }
}
