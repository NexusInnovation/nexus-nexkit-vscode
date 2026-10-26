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
 * - The extension backend services (MarketplaceService, TelemetryService, etc.)
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
      ["dismissInitWorkspace", this.handleDismissInitWorkspace.bind(this)],
      ["getMarketplaces", this.handleGetMarketplaces.bind(this)],
      ["addMarketplace", this.handleAddMarketplace.bind(this)],
      ["removeMarketplace", this.handleRemoveMarketplace.bind(this)],
      ["openPluginBrowser", this.handleOpenPluginBrowser.bind(this)],
      ["openFeedback", this.handleOpenFeedback.bind(this)],
      ["openConvertToMarkdown", this.handleOpenConvertToMarkdown.bind(this)],
      ["setMode", this.handleSetMode.bind(this)],
      // APM DevOps connection handlers
      ["getDevOpsConnections", this.handleGetDevOpsConnections.bind(this)],
      ["addDevOpsConnection", this.handleAddDevOpsConnection.bind(this)],
      ["removeDevOpsConnection", this.handleRemoveDevOpsConnection.bind(this)],
      ["setActiveDevOpsConnection", this.handleSetActiveDevOpsConnection.bind(this)],
      // GitHub workflow runner handlers
      ["listWorkflows", this.handleListWorkflows.bind(this)],
      ["runWorkflow", this.handleRunWorkflow.bind(this)],
    ]);

    // Auto-refresh marketplaces when the setting changes (including manual settings.json edits)
    this._services.marketplace.onDidChange(() => this.sendMarketplaces());

    // Auto-refresh all data when workspace is initialized
    this._services.workspaceInitialization.onWorkspaceInitialized(() => this.initialize());

    // Auto-refresh DevOps connections when they change
    this._services.devOpsConfig.onConnectionsChanged(() => this.sendDevOpsConnections());

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
    this.sendMarketplaces();
    this.sendDevOpsConnections();
    this.sendWorkflowList();
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
  }

  private async handleDismissInitWorkspace(message: WebviewMessage): Promise<void> {
    this.trackWebviewAction("dismissInitWorkspace");
    await SettingsManager.setWorkspaceInitPromptDismissed(true);
    this.sendWorkspaceState();
  }

  // ============================================================================
  // MARKETPLACE HANDLERS
  // ============================================================================

  private async handleGetMarketplaces(message: WebviewMessage): Promise<void> {
    this.sendMarketplaces();
  }

  private async handleAddMarketplace(message: WebviewMessage & { command: "addMarketplace" }): Promise<void> {
    this.trackWebviewAction("addMarketplace");
    try {
      await this._services.marketplace.add(message.source);
      this.sendMarketplaces();
    } catch (error) {
      this.sendToWebview({
        command: "marketplaceError",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleRemoveMarketplace(message: WebviewMessage & { command: "removeMarketplace" }): Promise<void> {
    this.trackWebviewAction("removeMarketplace");
    try {
      await this._services.marketplace.remove(message.source);
      this.sendMarketplaces();
    } catch (error) {
      console.error("Failed to remove marketplace:", error);
      this._services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
        context: "webview.removeMarketplace",
      });
      this.sendToWebview({
        command: "marketplaceError",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleOpenPluginBrowser(message: WebviewMessage): Promise<void> {
    this.trackWebviewAction("openPluginBrowser");
    await vscode.commands.executeCommand("workbench.agentPlugins.browse");
  }
  private async handleOpenFeedback(message: WebviewMessage): Promise<void> {
    this.trackWebviewAction("openFeedback");
    await vscode.commands.executeCommand(Commands.OPEN_FEEDBACK);
  }

  private async handleOpenConvertToMarkdown(message: WebviewMessage): Promise<void> {
    this.trackWebviewAction("openConvertToMarkdown");
    await vscode.commands.executeCommand(Commands.OPEN_CONVERT_TO_MARKDOWN);
  }

  private async handleSetMode(message: WebviewMessage & { command: "setMode" }): Promise<void> {
    this.trackWebviewAction("setMode");
    try {
      await SettingsManager.setMode(message.mode);
      await SettingsManager.setWorkspaceInitialized(true);
      this.sendWorkspaceState();
      this._services.telemetry.trackEvent("mode.selected", {
        mode: message.mode,
        context: "webview",
      });
    } catch (error) {
      console.error("Failed to set mode:", error);
      this._services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
        context: "webview.setMode",
      });
    }
  }

  // ============================================================================
  // APM DEVOPS CONNECTION HANDLERS
  // ============================================================================

  private async handleGetDevOpsConnections(message: WebviewMessage): Promise<void> {
    this.sendDevOpsConnections();
  }

  private async handleAddDevOpsConnection(message: WebviewMessage & { command: "addDevOpsConnection" }): Promise<void> {
    this.trackWebviewAction("addDevOpsConnection");
    try {
      await this._services.devOpsConfig.addConnection(message.url);
      this.sendDevOpsConnections();
    } catch (error) {
      console.error("Failed to add DevOps connection:", error);
      this._services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
        context: "webview.addDevOpsConnection",
      });
      this.sendToWebview({
        command: "devOpsConnectionError",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleRemoveDevOpsConnection(message: WebviewMessage & { command: "removeDevOpsConnection" }): Promise<void> {
    this.trackWebviewAction("removeDevOpsConnection");
    try {
      await this._services.devOpsConfig.removeConnection(message.connectionId);
      this.sendDevOpsConnections();
    } catch (error) {
      console.error("Failed to remove DevOps connection:", error);
      this._services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
        context: "webview.removeDevOpsConnection",
      });
      this.sendToWebview({
        command: "devOpsConnectionError",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleSetActiveDevOpsConnection(
    message: WebviewMessage & { command: "setActiveDevOpsConnection" }
  ): Promise<void> {
    this.trackWebviewAction("setActiveDevOpsConnection");
    try {
      await this._services.devOpsConfig.setActiveConnection(message.connectionId);
      this.sendDevOpsConnections();
    } catch (error) {
      console.error("Failed to set active DevOps connection:", error);
      this._services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
        context: "webview.setActiveDevOpsConnection",
      });
      this.sendToWebview({
        command: "devOpsConnectionError",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ============================================================================
  // GITHUB WORKFLOW RUNNER HANDLERS
  // ============================================================================

  private async handleListWorkflows(message: WebviewMessage): Promise<void> {
    await this.sendWorkflowList();
  }

  private async handleRunWorkflow(message: WebviewMessage & { command: "runWorkflow" }): Promise<void> {
    this.trackWebviewAction("runWorkflow");
    await this._services.githubWorkflowRunner.runWorkflow({
      workflowFile: message.workflowFile,
      job: message.job,
      event: message.event,
      dryRun: message.dryRun,
      list: message.list,
    });
  }

  // ============================================================================
  // DATA SENDERS - Send data to webview
  // ============================================================================

  private sendWorkspaceState(): void {
    const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    const isInitialized = SettingsManager.isWorkspaceInitialized();
    const isInitRefused = SettingsManager.isWorkspaceInitPromptDismissed();
    const mode = SettingsManager.getMode();

    this.sendToWebview({
      command: "workspaceStateUpdate",
      hasWorkspace,
      isInitialized,
      isInitRefused,
      mode,
    });
  }

  private sendMarketplaces(): void {
    this.sendToWebview({
      command: "marketplacesUpdate",
      configured: this._services.marketplace.getConfigured(),
      suggested: this._services.marketplace.getSuggestions(),
    });
  }

  private async sendDevOpsConnections(): Promise<void> {
    try {
      const connections = await this._services.devOpsConfig.getConnections();
      this.sendToWebview({
        command: "devOpsConnectionsUpdate",
        connections,
      });
    } catch (error) {
      console.error("Failed to fetch DevOps connections:", error);
      this.sendToWebview({
        command: "devOpsConnectionError",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async sendWorkflowList(): Promise<void> {
    try {
      const workflows = await this._services.githubWorkflowRunner.listWorkflows();
      this.sendToWebview({
        command: "workflowListUpdate",
        workflows,
      });
    } catch (error) {
      console.error("Failed to list workflows:", error);
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
