import * as vscode from "vscode";
import { TelemetryService } from "../../shared/services/telemetryService";
import { SettingsManager } from "../../core/settingsManager";
import { Commands } from "../../shared/constants/commands";
import { AITemplateDataService } from "../ai-template-files/services/aiTemplateDataService";
import { AITemplateFile, AITemplateFileType } from "../ai-template-files/models/aiTemplateFile";
import { WebviewMessage, ExtensionMessage } from "./types/webviewMessages";

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
    private readonly _telemetryService: TelemetryService,
    private readonly _aiTemplateDataService: AITemplateDataService
  ) {
    this._messageHandlers = new Map([
      ["initWorkspace", this.handleInitWorkspace.bind(this)],
      ["getTemplateData", this.handleGetTemplateData.bind(this)],
      ["installTemplate", this.handleInstallTemplate.bind(this)],
      ["uninstallTemplate", this.handleUninstallTemplate.bind(this)],
    ]);

    // Auto-refresh template data when it changes (e.g., after config update)
    this._aiTemplateDataService.onDataChanged(() => this.sendTemplateData());
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
    await this._aiTemplateDataService.syncInstalledTemplates();
    this.sendInstalledTemplates();
  }

  // ============================================================================
  // MESSAGE HANDLERS - Process webview requests
  // ============================================================================

  /**
   * Handle: User clicked "Initialize Workspace" button
   */
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
      await this._aiTemplateDataService.installTemplate(message.template);
      this.sendInstalledTemplates();
    } catch (error) {
      console.error("Failed to install template:", error);
    }
  }

  private async handleUninstallTemplate(message: WebviewMessage & { command: "uninstallTemplate" }): Promise<void> {
    this.trackWebviewAction("uninstallTemplate");
    try {
      await this._aiTemplateDataService.uninstallTemplate(message.template);
      this.sendInstalledTemplates();
    } catch (error) {
      console.error("Failed to uninstall template:", error);
    }
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
      await this._aiTemplateDataService.waitForReady();
      this.sendToWebview({
        command: "templateDataUpdate",
        repositories: this._aiTemplateDataService.getRepositoryTemplatesMap(),
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
        installed: this._aiTemplateDataService.getInstalledTemplates(),
      });
    } catch (error) {
      console.error("Failed to fetch installed templates:", error);
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
    this._telemetryService.trackEvent("ui.button.clicked", {
      buttonName: actionName,
      source: "webview",
    });
  }
}
