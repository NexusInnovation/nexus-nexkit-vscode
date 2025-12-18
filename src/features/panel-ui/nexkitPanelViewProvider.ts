import * as vscode from "vscode";
import { WebviewTemplate } from "./webviewTemplate";
import { TelemetryService } from "../../shared/services/telemetryService";
import { getExtensionVersion } from "../../shared/utils/extensionHelper";
import { SettingsManager } from "../../core/settingsManager";
import { MultiRepositoryAggregatorService } from "../ai-resources/multiRepositoryAggregatorService";
import { WorkspaceAIResourceService } from "../ai-resources/workspaceAIResourceService";

export class NexkitPanelViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    context: vscode.ExtensionContext,
    private readonly _repositoryAggregator: MultiRepositoryAggregatorService,
    private readonly _contentManager: WorkspaceAIResourceService,
    private readonly _telemetryService: TelemetryService
  ) {
    // Listen for workspace folder changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
        this.updateWorkspaceState(hasWorkspace);
      })
    );
  }

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    // Generate webview HTML
    webviewView.webview.html = WebviewTemplate.generateHTML();

    // Set up message listener
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "ready":
          // Webview is ready - send initial version, status, workspace and initialization state
          const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
          this._postStatusMessage("Ready", { hasWorkspace });
          break;

        case "initProject":
          this._telemetryService.trackEvent("ui.button.clicked", {
            buttonName: "initProject",
            source: "webview",
          });
          await vscode.commands.executeCommand("nexus-nexkit-vscode.initProject");
          this._postStatusMessage("Project initialized");
          break;

        case "reinitializeProject":
          this._telemetryService.trackEvent("ui.button.clicked", {
            buttonName: "reinitializeProject",
            source: "webview",
          });
          await vscode.commands.executeCommand("nexus-nexkit-vscode.reinitializeProject");
          this._postStatusMessage("Project re-initialized");
          break;

        case "installUserMCPs":
          this._telemetryService.trackEvent("ui.button.clicked", {
            buttonName: "installUserMCPs",
            source: "webview",
          });
          await vscode.commands.executeCommand("nexus-nexkit-vscode.installUserMCPs");
          this._postStatusMessage("User MCP servers installed");
          break;

        case "openSettings":
          this._telemetryService.trackEvent("ui.button.clicked", {
            buttonName: "openSettings",
            source: "webview",
          });
          await vscode.commands.executeCommand("nexus-nexkit-vscode.openSettings");
          break;

        case "loadRepositories":
          try {
            console.log("[Nexkit] Loading items from all repositories...");

            const repositories = await this._repositoryAggregator.fetchAllItemsFromAllRepositories();
            const installed = await this._contentManager.getInstalledItems();

            console.log(`[Nexkit] Loaded ${Object.keys(repositories).length} repositories`);

            webviewView.webview.postMessage({
              command: "repositoriesLoaded",
              repositories,
              installed,
            });
          } catch (error) {
            console.error("[Nexkit] Error loading repositories:", error);
            webviewView.webview.postMessage({
              command: "repositoriesError",
              error: error instanceof Error ? error.message : String(error),
            });
          }
          break;

        case "refreshRepositories":
          try {
            console.log("[Nexkit] Clearing all repository caches...");
            this._repositoryAggregator.clearAll();
            webviewView.webview.postMessage({ command: "loadRepositories" });
            vscode.window.showInformationMessage("Repositories refreshed successfully");
          } catch (error) {
            console.error("[Nexkit] Error refreshing repositories:", error);
            vscode.window.showErrorMessage(`Failed to refresh repositories: ${error}`);
          }
          break;

        case "installItem":
          try {
            const { item } = message;
            const content = await this._repositoryAggregator.downloadFile(item);
            await this._contentManager.installItem(item, content);
            webviewView.webview.postMessage({
              command: "itemInstalled",
              item,
            });
          } catch (error) {
            console.error("Error installing item:", error);
            vscode.window.showErrorMessage(`Failed to install item: ${error}`);
          }
          break;

        case "uninstallItem":
          try {
            const { item } = message;
            await this._contentManager.uninstallItem(item);
            webviewView.webview.postMessage({
              command: "itemUninstalled",
              item,
            });
          } catch (error) {
            console.error("Error uninstalling item:", error);
            vscode.window.showErrorMessage(`Failed to uninstall item: ${error}`);
          }
          break;
      }
    });
  }

  public updateWorkspaceState(hasWorkspace: boolean) {
    if (this._view) {
      this._view.webview.postMessage({ hasWorkspace });
    }
  }

  private _postStatusMessage(status: string, additionalData?: Record<string, any>): void {
    if (!this._view) return;

    this._view.webview.postMessage({
      version: getExtensionVersion() || "Unknown",
      status,
      isInitialized: SettingsManager.isWorkspaceInitialized(),
      ...additionalData,
    });
  }
}
