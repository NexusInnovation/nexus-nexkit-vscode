import * as vscode from "vscode";
import { StateManager } from "./stateManager";

export class NexkitPanel {
  public static currentPanel: NexkitPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  public static readonly viewType = "nexkitCustomView";

  private _version: string = "Loading...";
  private _status: string = "Ready";
  private _isInitialized: boolean = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
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
    return StateManager.getWorkspaceInitialized();
  }

  public async refresh() {
    await this._initializeVersionStatus();
  }

  // Helper to get HTML for a webview (static so other providers can use it)
  public static getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
  ): string {
    // For now we don't need webview.asWebviewUri, but keep signature for future assets
    // Return the same HTML as _getHtmlForWebview
    return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Nexkit Panel</title>
                <style>
                    body { font-family: sans-serif; margin: 0; padding: 0; }
                    .container { padding: 16px; }
                    .static-info { background: #fffdfd23; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
                    .actions { display: flex; flex-direction: column; gap: 12px; }
                    button { padding: 8px 16px; font-size: 1em; border-radius: 4px; border: none; background: #007acc; color: white; cursor: pointer; }
                    button:hover:not(:disabled) { background: #005fa3; }
                    button:disabled { background: #555; color: #999; cursor: not-allowed; opacity: 0.6; }
                    .button-description { font-size: 0.85em; color: #888; margin-top: 4px; margin-bottom: 8px; line-height: 1.3; }
                    .button-description.disabled { opacity: 0.6; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="static-info">
                        <h2>Nexkit Extension</h2>
                        <p>Version: <span id="version">Loading...</span></p>
                        <p>Status: <span id="status">Loading...</span></p>
                    </div>
                    <div class="actions">
                        <!-- Default: show initialize until state known; JS will swap if already initialized -->
                        <button id="initializeProjectBtn" onclick="vscode.postMessage({ command: 'initProject' })" disabled>Initialize Project</button>
                        <p class="button-description disabled" id="initializeProjectBtnDesc">Set up Nexkit templates and configuration for your workspace</p>
                        <button id="reinitializeProjectBtn" onclick="vscode.postMessage({ command: 'reinitializeProject' })" style="display: none;" disabled>Re-initialize Project</button>
                        <p class="button-description disabled" id="reinitializeProjectBtnDesc" style="display: none;">Reset project configuration and redeploy templates</p>
                        <button id="updateTemplatesBtn" onclick="vscode.postMessage({ command: 'updateTemplates' })" disabled>Update Nexkit Templates</button>
                        <p class="button-description disabled" id="updateTemplatesBtnDesc">Update templates to the latest version from the extension</p>
                        <button id="installUserMCPsBtn" onclick="vscode.postMessage({ command: 'installUserMCPs' })">Install User MCP Servers</button>
                        <p class="button-description" id="installUserMCPsBtnDesc">Install required MCP servers for enhanced AI capabilities</p>
                        <button id="openSettingsBtn" onclick="vscode.postMessage({ command: 'openSettings' })">Open Settings</button>
                        <p class="button-description" id="openSettingsBtnDesc">Configure Nexkit extension preferences and project settings</p>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const { version, status, hasWorkspace, isInitialized } = event.data;
                        if (typeof version !== 'undefined') {
                            document.getElementById('version').textContent = version;
                        }
                        if (typeof status !== 'undefined') {
                            document.getElementById('status').textContent = status;
                        }
                        
                        const updateTemplatesBtn = document.getElementById('updateTemplatesBtn');
                        const initializeProjectBtn = document.getElementById('initializeProjectBtn');
                        const reinitializeProjectBtn = document.getElementById('reinitializeProjectBtn');
                        const updateTemplatesBtnDesc = document.getElementById('updateTemplatesBtnDesc');
                        const initializeProjectBtnDesc = document.getElementById('initializeProjectBtnDesc');
                        const reinitializeProjectBtnDesc = document.getElementById('reinitializeProjectBtnDesc');
                        
                        // Handle initialization state changes - show/hide mutually exclusive buttons and descriptions
                        if (typeof isInitialized !== 'undefined') {
                            if (initializeProjectBtn && reinitializeProjectBtn && initializeProjectBtnDesc && reinitializeProjectBtnDesc) {
                                if (isInitialized) {
                                    // Project is initialized - show reinitialize button and description only
                                    initializeProjectBtn.style.display = 'none';
                                    initializeProjectBtnDesc.style.display = 'none';
                                    reinitializeProjectBtn.style.display = 'block';
                                    reinitializeProjectBtnDesc.style.display = 'block';
                                } else {
                                    // Project not initialized - show initialize button and description only
                                    initializeProjectBtn.style.display = 'block';
                                    initializeProjectBtnDesc.style.display = 'block';
                                    reinitializeProjectBtn.style.display = 'none';
                                    reinitializeProjectBtnDesc.style.display = 'none';
                                }
                            }
                        }
                        
                        // Handle workspace state changes - must come after display logic
                        if (typeof hasWorkspace !== 'undefined') {
                            // Enable/disable workspace-dependent buttons and descriptions
                            if (updateTemplatesBtn) {
                                updateTemplatesBtn.disabled = !hasWorkspace;
                            }
                            if (updateTemplatesBtnDesc) {
                                if (hasWorkspace) {
                                    updateTemplatesBtnDesc.classList.remove('disabled');
                                } else {
                                    updateTemplatesBtnDesc.classList.add('disabled');
                                }
                            }
                            if (initializeProjectBtn) {
                                initializeProjectBtn.disabled = !hasWorkspace;
                            }
                            if (initializeProjectBtnDesc) {
                                if (hasWorkspace) {
                                    initializeProjectBtnDesc.classList.remove('disabled');
                                } else {
                                    initializeProjectBtnDesc.classList.add('disabled');
                                }
                            }
                            if (reinitializeProjectBtn) {
                                reinitializeProjectBtn.disabled = !hasWorkspace;
                            }
                            if (reinitializeProjectBtnDesc) {
                                if (hasWorkspace) {
                                    reinitializeProjectBtnDesc.classList.remove('disabled');
                                } else {
                                    reinitializeProjectBtnDesc.classList.add('disabled');
                                }
                            }
                        }
                    });
                    
                    // Signal to the extension that the webview is ready to receive messages
                    vscode.postMessage({ command: 'ready' });
                </script>
            </body>
            </html>
        `;
  }

  public static createOrShow(extensionUri: vscode.Uri) {
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
      NexkitPanel.currentPanel = new NexkitPanel(panel, extensionUri);
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
        case "initProject":
          await vscode.commands.executeCommand("nexkit-vscode.initProject");
          this._status = "Project initialized";
          this._version = await this._getExtensionVersion();
          this._isInitialized = await this._checkIsInitialized();
          this._postVersionStatus();
          this._panel.webview.postMessage({
            isInitialized: this._isInitialized,
          });
          break;
        case "updateTemplates":
          await vscode.commands.executeCommand("nexkit-vscode.updateTemplates");
          this._status = "Templates updated";
          this._version = await this._getExtensionVersion();
          this._postVersionStatus();
          break;
        case "reinitializeProject":
          await vscode.commands.executeCommand(
            "nexkit-vscode.reinitializeProject"
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
          await vscode.commands.executeCommand("nexkit-vscode.installUserMCPs");
          this._status = "User MCP servers installed";
          this._postVersionStatus();
          break;
        case "openSettings":
          await vscode.commands.executeCommand("nexkit-vscode.openSettings");
          this._status = "Settings opened";
          this._postVersionStatus();
          break;
      }
    }, undefined);
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
      const ext = vscode.extensions.getExtension("nexusinno.nexkit-vscode");
      return ext?.packageJSON.version || "Unknown";
    } catch {
      return "Unknown";
    }
  }
}
