import * as vscode from "vscode";
import { WebviewTemplate } from "./webviewTemplate";
import { TelemetryService } from "../../shared/services/telemetryService";
import { getExtensionVersion } from "../../shared/utils/extensionHelper";
import { SettingsManager } from "../../core/settingsManager";
import { GitHubRepositoryManagerService } from "../ai-template-files/aiTemplateFilesManagerService";
import { WorkspaceAIResourceService } from "../ai-template-files/workspaceAIResourceService";

export class NexkitPanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "nexkitPanelView";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _gitHubRepositoryManager: GitHubRepositoryManagerService,
    private readonly _contentManager: WorkspaceAIResourceService,
    private readonly _telemetryService: TelemetryService
  ) {}

  public initialize(context: vscode.ExtensionContext) {
    // Listen for workspace folder changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
        this.updateWorkspaceState(hasWorkspace);
      })
    );

    // Register the webview view provider
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(NexkitPanelViewProvider.viewId, this, {
        webviewOptions: { retainContextWhenHidden: true }, // todo: maybe disable retainContextWhenHidden for performance
      })
    );
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this._view = webviewView;

    this._view.webview.options = {
      enableScripts: true,
    };

    // Generate webview HTML
    this._view.webview.html = WebviewTemplate.generateHTML();

    // Set up message listener
    this._view.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "ready":
          // Webview is ready - send initial version, status, workspace and initialization state
          const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
          this.postStatusMessage("Ready", { hasWorkspace });
          break;

        case "initProject":
          this._telemetryService.trackEvent("ui.button.clicked", {
            buttonName: "initProject",
            source: "webview",
          });
          await vscode.commands.executeCommand("nexus-nexkit-vscode.initProject");
          this.postStatusMessage("Project initialized");
          break;

        case "reinitializeProject":
          this._telemetryService.trackEvent("ui.button.clicked", {
            buttonName: "reinitializeProject",
            source: "webview",
          });
          await vscode.commands.executeCommand("nexus-nexkit-vscode.reinitializeProject");
          this.postStatusMessage("Project re-initialized");
          break;

        case "installUserMCPs":
          this._telemetryService.trackEvent("ui.button.clicked", {
            buttonName: "installUserMCPs",
            source: "webview",
          });
          await vscode.commands.executeCommand("nexus-nexkit-vscode.installUserMCPs");
          this.postStatusMessage("User MCP servers installed");
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

            const repositories = await this._gitHubRepositoryManager.fetchAllItems();
            const installed = await this._contentManager.getInstalledItems();

            console.log(`[Nexkit] Loaded ${Object.keys(repositories).length} repositories`);

            this._view!.webview.postMessage({
              command: "repositoriesLoaded",
              repositories,
              installed,
            });
          } catch (error) {
            console.error("[Nexkit] Error loading repositories:", error);
            this._view!.webview.postMessage({
              command: "repositoriesError",
              error: error instanceof Error ? error.message : String(error),
            });
          }
          break;

        case "refreshRepositories":
          try {
            console.log("[Nexkit] Clearing all repository caches...");
            this._gitHubRepositoryManager.clearAllCaches();
            this._view!.webview.postMessage({ command: "loadRepositories" });
            vscode.window.showInformationMessage("Repositories refreshed successfully");
          } catch (error) {
            console.error("[Nexkit] Error refreshing repositories:", error);
            vscode.window.showErrorMessage(`Failed to refresh repositories: ${error}`);
          }
          break;

        case "installItem":
          try {
            const { item } = message;
            const content = await this._gitHubRepositoryManager.downloadFile(item);
            await this._contentManager.installItem(item, content);
            this._view!.webview.postMessage({
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
            this._view!.webview.postMessage({
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

  private updateWorkspaceState(hasWorkspace: boolean) {
    if (this._view) {
      this._view.webview.postMessage({ hasWorkspace });
    }
  }

  private postStatusMessage(status: string, additionalData?: Record<string, any>): void {
    if (!this._view) return;

    this._view.webview.postMessage({
      version: getExtensionVersion() || "Unknown",
      status,
      isInitialized: SettingsManager.isWorkspaceInitialized(),
      ...additionalData,
    });
  }
}
