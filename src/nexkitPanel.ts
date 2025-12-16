import * as vscode from "vscode";
import { ContentManager, ContentCategory } from "./services/contentManagerService";
import { MultiRepositoryAggregator } from "./services/multiRepositoryAggregatorService";
import { RepositoryItem } from "./repositories/IRepositoryService";
import { WebviewTemplate } from "./ui/WebviewTemplate";

export class NexkitPanel {
  public static currentPanel: NexkitPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _repositoryAggregator: MultiRepositoryAggregator;
  private readonly _contentManager: ContentManager;

  public static readonly viewType = "nexkitCustomView";

  private _version: string = "Loading...";
  private _status: string = "Ready";
  private _isInitialized: boolean = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    repositoryAggregator: MultiRepositoryAggregator,
    contentManager: ContentManager
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._repositoryAggregator = repositoryAggregator;
    this._contentManager = contentManager;
    this._panel.webview.html = this._getHtmlForWebview();
    this._setWebviewMessageListener();
    // Don't send version/status yet - wait for webview to signal it's ready
  }

  private async _initializeVersionStatus() {
    this._version = await this._getExtensionVersion();
    this._status = "Ready";
    this._isInitialized = await this._checkIsInitialized();
    this._postVersionStatus();
  }

  private async _checkIsInitialized(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration("nexkit");
    return config.get("workspace.initialized", false);
  }

  public async refresh() {
    await this._initializeVersionStatus();
  }

  // Helper to get HTML for a webview (static so other providers can use it)
  public static getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
  ): string {
    return WebviewTemplate.generateHTML();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    repositoryAggregator: MultiRepositoryAggregator,
    contentManager: ContentManager
  ) {
    const column = vscode.ViewColumn.One;
    if (NexkitPanel.currentPanel) {
      NexkitPanel.currentPanel._panel.reveal(column);
      // Refresh data when revealing existing panel
      NexkitPanel.currentPanel.refresh();
    } else {
      const panel = vscode.window.createWebviewPanel(
        NexkitPanel.viewType,
        "Nexkit Info & Actions",
        column,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );
      NexkitPanel.currentPanel = new NexkitPanel(
        panel,
        extensionUri,
        repositoryAggregator,
        contentManager
      );
    }
  }

  private _getHtmlForWebview(): string {
    return NexkitPanel.getWebviewContent(
      this._panel.webview,
      this._extensionUri
    );
  }

  private _setWebviewMessageListener() {
    this._panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "ready":
          // Webview is ready to receive messages
          await this._initializeVersionStatus();
          // Also send workspace state and initialization state
          const hasWorkspace =
            (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
          this._panel.webview.postMessage({
            hasWorkspace,
            isInitialized: this._isInitialized,
          });
          break;
        case "loadRepositories":
          await this._loadRepositories();
          break;
        case "refreshRepositories":
          await this._refreshRepositories();
          break;
        case "installItem":
          await this._installItem(message.item);
          break;
        case "removeItem":
          await this._removeItem(message.category, message.itemName);
          break;
        case "initProject":
          await vscode.commands.executeCommand(
            "nexus-nexkit-vscode.initProject"
          );
          this._status = "Project initialized";
          this._version = await this._getExtensionVersion();
          this._isInitialized = await this._checkIsInitialized();
          this._postVersionStatus();
          this._panel.webview.postMessage({
            isInitialized: this._isInitialized,
          });
          break;
        case "updateTemplates":
          await vscode.commands.executeCommand(
            "nexus-nexkit-vscode.updateTemplates"
          );
          this._status = "Templates updated";
          this._version = await this._getExtensionVersion();
          this._postVersionStatus();
          break;
        case "reinitializeProject":
          await vscode.commands.executeCommand(
            "nexus-nexkit-vscode.reinitializeProject"
          );
          this._status = "Project re-initialized";
          this._version = await this._getExtensionVersion();
          this._isInitialized = await this._checkIsInitialized();
          this._postVersionStatus();
          this._panel.webview.postMessage({
            isInitialized: this._isInitialized,
          });
          break;
        case "installUserMCPs":
          await vscode.commands.executeCommand(
            "nexus-nexkit-vscode.installUserMCPs"
          );
          this._status = "User MCP servers installed";
          this._postVersionStatus();
          break;
        case "openSettings":
          await vscode.commands.executeCommand(
            "nexus-nexkit-vscode.openSettings"
          );
          this._status = "Settings opened";
          this._postVersionStatus();
          break;
      }
    }, undefined);
  }

  /**
   * Load all repositories and their items
   */
  private async _loadRepositories() {
    try {
      console.log("[Nexkit] Loading items from all repositories...");

      // Fetch all items from all repositories at once (new efficient method)
      const repositories = await this._repositoryAggregator.fetchAllItemsFromAllRepositories();

      // Get installed items
      const installed = await this._contentManager.getInstalledItems();

      console.log(`[Nexkit] Loaded ${Object.keys(repositories).length} repositories`);

      // Send to webview
      this._panel.webview.postMessage({
        command: "repositoriesLoaded",
        repositories,
        installed: {
          agents: Array.from(installed.agents),
          prompts: Array.from(installed.prompts),
          instructions: Array.from(installed.instructions),
          chatmodes: Array.from(installed.chatmodes),
        },
      });
    } catch (error) {
      console.error("[Nexkit] Error loading repositories:", error);
      this._panel.webview.postMessage({
        command: "repositoriesError",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Refresh all repositories (clear cache and reload)
   */
  private async _refreshRepositories() {
    try {
      console.log("[Nexkit] Refreshing all repositories...");
      this._repositoryAggregator.refreshAll();
      await this._loadRepositories();
      vscode.window.showInformationMessage("Repositories refreshed successfully");
    } catch (error) {
      console.error("[Nexkit] Error refreshing repositories:", error);
      vscode.window.showErrorMessage(`Failed to refresh repositories: ${error}`);
    }
  }

  /**
   * Install an item from a repository
   */
  private async _installItem(item: RepositoryItem) {
    try {
      // Download file content
      const content = await this._repositoryAggregator.downloadFile(item.rawUrl);

      // Install file using new method that tracks metadata
      await this._contentManager.installItem(item, content);

      // Notify webview
      this._panel.webview.postMessage({
        command: "itemInstalled",
        category: item.category,
        itemName: item.name,
      });
    } catch (error) {
      console.error("Error installing item:", error);
      vscode.window.showErrorMessage(
        `Failed to install ${item.name}: ${error}`
      );
    }
  }

  /**
   * Remove an item
   */
  private async _removeItem(
    category: ContentCategory,
    itemName: string
  ) {
    try {
      // Remove file
      await this._contentManager.removeFile(category, itemName);

      // Notify webview
      this._panel.webview.postMessage({
        command: "itemRemoved",
        category,
        itemName,
      });
    } catch (error) {
      console.error("Error removing item:", error);
      // Error is already shown by contentManager
    }
  }

  private _postVersionStatus() {
    this._panel.webview.postMessage({
      version: this._version,
      status: this._status,
      isInitialized: this._isInitialized,
    });
  }

  private async _getExtensionVersion(): Promise<string> {
    try {
      const ext = vscode.extensions.getExtension(
        "nexusinno.nexus-nexkit-vscode"
      );
      return ext?.packageJSON.version || "Unknown";
    } catch {
      return "Unknown";
    }
  }
}
