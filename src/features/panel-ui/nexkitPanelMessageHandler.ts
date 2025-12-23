import * as vscode from "vscode";
import { TelemetryService } from "../../shared/services/telemetryService";
import { SettingsManager } from "../../core/settingsManager";
import { Commands } from "../../shared/constants/commands";
import { AITemplateDataService } from "../ai-template-files/services/aiTemplateDataService";
import { AITemplateFile, AITemplateFileType } from "../ai-template-files/models/aiTemplateFile";
import { WebviewMessage, RepositoryTemplateData, TemplateFileData } from "./types/webviewMessages";

/**
 * Handles all message processing and business logic for the Nexkit panel
 */
export class NexkitPanelMessageHandler {
  private readonly _messageHandlers: Map<string, (message: WebviewMessage) => Promise<void>>;

  constructor(
    private readonly getWebview: () => vscode.WebviewView | undefined,
    private readonly _telemetryService: TelemetryService,
    private readonly _aiTemplateDataService: AITemplateDataService
  ) {
    // Initialize message handler map
    this._messageHandlers = new Map([
      ["ready", this.handleReady.bind(this)],
      ["initProject", this.handleInitProject.bind(this)],
      ["getTemplateData", this.handleGetTemplateData.bind(this)],
      ["getInstalledTemplates", this.handleGetInstalledTemplates.bind(this)],
      ["installTemplate", this.handleInstallTemplate.bind(this)],
      ["uninstallTemplate", this.handleUninstallTemplate.bind(this)],
    ]);

    this._aiTemplateDataService.onDataChanged(() => {
      // Notify webview of template data changes
      this.handleGetTemplateData({ command: "getTemplateData" });
    });
  }

  /**
   * Main entry point for handling messages from the webview
   */
  public async handleMessage(message: WebviewMessage): Promise<void> {
    const handler = this._messageHandlers.get(message.command);
    if (handler) {
      await handler(message);
    } else {
      console.warn(`[Nexkit] Unknown command: ${message.command}`);
    }
  }

  /**
   * Handle workspace changes. Called when workspace folders change or when the panel becomes visible
   */
  public onWorkspaceChanged(): void {
    this.sendWorkspaceState();
    this.sendInstalledTemplatesRefresh();
  }

  private async handleReady(message: WebviewMessage): Promise<void> {
    // Webview is ready - send workspace state
    this.sendWorkspaceState();
  }

  private async handleInitProject(message: WebviewMessage): Promise<void> {
    this.trackWebviewAction("initProject");
    await vscode.commands.executeCommand(Commands.INIT_WORKSPACE);
    this.sendWorkspaceState();
  }

  /**
   * Send workspace state update to webview
   */
  public sendWorkspaceState(): void {
    const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    const isInitialized = SettingsManager.isWorkspaceInitialized();

    this.sendMessage({
      command: "workspaceStateUpdate",
      hasWorkspace,
      isInitialized,
    });
  }

  /**
   * Refresh installed templates in the webview
   */
  private sendInstalledTemplatesRefresh(): void {
    this.sendMessage({ command: "getInstalledTemplates" });
  }

  /**
   * Template Management Handlers
   */

  private async handleGetTemplateData(message: WebviewMessage): Promise<void> {
    try {
      // Wait for AI template service to be ready
      await this._aiTemplateDataService.waitForReady();

      const repositoryNames = this._aiTemplateDataService.getRepositoryNames();

      // Organize templates by repository and type
      const repositories: RepositoryTemplateData[] = repositoryNames.map((repoName) => {
        const repoTemplates = this._aiTemplateDataService.getTemplatesByRepository(repoName);

        const types = {
          agents: [] as TemplateFileData[],
          prompts: [] as TemplateFileData[],
          instructions: [] as TemplateFileData[],
          chatmodes: [] as TemplateFileData[],
        };

        // Group templates by type
        repoTemplates.forEach((template) => {
          const templateData: TemplateFileData = {
            name: template.name,
            type: template.type,
            rawUrl: template.rawUrl,
            repository: template.repository,
            repositoryUrl: template.repositoryUrl,
          };

          if (types[template.type as AITemplateFileType]) {
            types[template.type as AITemplateFileType].push(templateData);
          }
        });

        // Get repository URL from first template (they all have the same repo URL)
        const repoUrl = repoTemplates[0]?.repositoryUrl || "";

        return {
          name: repoName,
          url: repoUrl,
          types,
        };
      });

      // Send template data to webview
      this.sendMessage({
        command: "templateDataUpdate",
        repositories,
      });
    } catch (error) {
      console.error("Failed to get template data:", error);
      vscode.window.showErrorMessage(`Failed to load template data: ${error}`);
    }
  }

  private async handleGetInstalledTemplates(message: WebviewMessage): Promise<void> {
    try {
      const installed = await this._aiTemplateDataService.getInstalledTemplates();

      this.sendMessage({
        command: "installedTemplatesUpdate",
        installed,
      });
    } catch (error) {
      console.error("Failed to get installed templates:", error);
    }
  }

  private async handleInstallTemplate(message: WebviewMessage & { command: "installTemplate" }): Promise<void> {
    this.trackWebviewAction("installTemplate");

    try {
      const { template } = message;

      // Convert TemplateFileData to AITemplateFile
      const aiTemplate: AITemplateFile = {
        name: template.name,
        type: template.type as AITemplateFileType,
        rawUrl: template.rawUrl,
        repository: template.repository,
        repositoryUrl: template.repositoryUrl,
      };

      // Install the template
      await this._aiTemplateDataService.installTemplate(aiTemplate);

      // Refresh installed templates
      await this.handleGetInstalledTemplates(message);
    } catch (error) {
      console.error("Failed to install template:", error);
      // Error notification already handled by service
    }
  }

  private async handleUninstallTemplate(message: WebviewMessage & { command: "uninstallTemplate" }): Promise<void> {
    this.trackWebviewAction("uninstallTemplate");

    try {
      const { template } = message;

      // Convert TemplateFileData to AITemplateFile
      const aiTemplate: AITemplateFile = {
        name: template.name,
        type: template.type as AITemplateFileType,
        rawUrl: template.rawUrl,
        repository: template.repository,
        repositoryUrl: template.repositoryUrl,
      };

      // Uninstall the template
      await this._aiTemplateDataService.uninstallTemplate(aiTemplate);

      // Refresh installed templates
      await this.handleGetInstalledTemplates(message);
    } catch (error) {
      console.error("Failed to uninstall template:", error);
      // Error notification already handled by service
    }
  }

  /**
   * Track telemetry for webview actions
   */
  private trackWebviewAction(actionName: string): void {
    this._telemetryService.trackEvent("ui.button.clicked", {
      buttonName: actionName,
      source: "webview",
    });
  }

  /**
   * Send a message to the webview
   */
  private sendMessage(message: any): void {
    const view = this.getWebview();
    if (view) {
      view.webview.postMessage(message);
    }
  }
}
