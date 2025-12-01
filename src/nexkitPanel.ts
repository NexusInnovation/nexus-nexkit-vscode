import * as vscode from "vscode";
import {
  AwesomeCopilotService,
  AwesomeCopilotItem,
} from "./awesomeCopilotService";
import { ContentManager } from "./contentManager";

export class NexkitPanel {
  public static currentPanel: NexkitPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _awesomeCopilotService: AwesomeCopilotService;
  private readonly _contentManager: ContentManager;

  public static readonly viewType = "nexkitCustomView";

  private _version: string = "Loading...";
  private _status: string = "Ready";
  private _isInitialized: boolean = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    awesomeCopilotService: AwesomeCopilotService,
    contentManager: ContentManager
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._awesomeCopilotService = awesomeCopilotService;
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
                    .actions { display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px; }
                    button { padding: 8px 16px; font-size: 1em; border-radius: 4px; border: none; background: #007acc; color: white; cursor: pointer; }
                    button:hover:not(:disabled) { background: #005fa3; }
                    button:disabled { background: #555; color: #999; cursor: not-allowed; opacity: 0.6; }
                    .button-description { font-size: 0.85em; color: #888; margin-top: 4px; margin-bottom: 8px; line-height: 1.3; }
                    .button-description.disabled { opacity: 0.6; color: #666; }
                    
                    /* Awesome Copilot Library Styles */
                    .library-section { background: #fffdfd23; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
                    .library-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
                    .library-header h2 { margin: 0; font-size: 1.2em; }
                    .library-header .toggle { font-size: 1.2em; }
                    .category { margin-top: 16px; }
                    .category-header { display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #ffffff10; border-radius: 4px; cursor: pointer; user-select: none; margin-bottom: 8px; }
                    .category-header h3 { margin: 0; font-size: 1em; }
                    .category-header .badge { background: #007acc; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
                    .category-header .toggle { font-size: 1em; }
                    .category-content { display: none; padding-left: 8px; }
                    .category-content.expanded { display: block; }
                    .item { display: flex; align-items: flex-start; padding: 8px; margin-bottom: 4px; border-radius: 4px; }
                    .item:hover { background: #ffffff08; }
                    .item input[type="checkbox"] { margin-right: 8px; margin-top: 2px; cursor: pointer; }
                    .item-info { flex: 1; }
                    .item-name { font-weight: 500; margin-bottom: 2px; }
                    .item-description { font-size: 0.85em; color: #888; }
                    .loading { text-align: center; padding: 20px; color: #888; }
                    .error { color: #f48771; padding: 8px; }
                    .empty { text-align: center; padding: 20px; color: #888; font-style: italic; }
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
                    
                    <!-- Awesome Copilot Library Section -->
                    <div class="library-section">
                        <div class="library-header" onclick="toggleLibrary()">
                            <h2>Awesome Copilot Library</h2>
                            <span class="toggle" id="libraryToggle">▼</span>
                        </div>
                        <div id="libraryContent" class="category-content">
                            <p class="button-description">Browse and install agents, prompts, and custom instructions from the GitHub awesome-copilot repository</p>
                            
                            <!-- Agents Category -->
                            <div class="category">
                                <div class="category-header" onclick="toggleCategory('agents')">
                                    <h3>🤖 Agents</h3>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="badge" id="agentsBadge">0</span>
                                        <span class="toggle" id="agentsToggle">▶</span>
                                    </div>
                                </div>
                                <div id="agentsContent" class="category-content">
                                    <div class="loading">Loading agents...</div>
                                </div>
                            </div>
                            
                            <!-- Prompts Category -->
                            <div class="category">
                                <div class="category-header" onclick="toggleCategory('prompts')">
                                    <h3>🎯 Prompts</h3>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="badge" id="promptsBadge">0</span>
                                        <span class="toggle" id="promptsToggle">▶</span>
                                    </div>
                                </div>
                                <div id="promptsContent" class="category-content">
                                    <div class="loading">Loading prompts...</div>
                                </div>
                            </div>
                            
                            <!-- Instructions Category -->
                            <div class="category">
                                <div class="category-header" onclick="toggleCategory('instructions')">
                                    <h3>📋 Instructions</h3>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="badge" id="instructionsBadge">0</span>
                                        <span class="toggle" id="instructionsToggle">▶</span>
                                    </div>
                                </div>
                                <div id="instructionsContent" class="category-content">
                                    <div class="loading">Loading instructions...</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // State management
                    let libraryExpanded = false;
                    let expandedCategories = new Set();
                    let items = { agents: [], prompts: [], instructions: [] };
                    let installedItems = { agents: new Set(), prompts: new Set(), instructions: new Set() };
                    
                    // Toggle library section
                    function toggleLibrary() {
                        libraryExpanded = !libraryExpanded;
                        const content = document.getElementById('libraryContent');
                        const toggle = document.getElementById('libraryToggle');
                        if (libraryExpanded) {
                            content.classList.add('expanded');
                            toggle.textContent = '▼';
                            // Load items if not already loaded
                            if (items.agents.length === 0) {
                                vscode.postMessage({ command: 'loadAwesomeItems' });
                            }
                        } else {
                            content.classList.remove('expanded');
                            toggle.textContent = '▶';
                        }
                    }
                    
                    // Toggle category
                    function toggleCategory(category) {
                        const content = document.getElementById(category + 'Content');
                        const toggle = document.getElementById(category + 'Toggle');
                        
                        if (expandedCategories.has(category)) {
                            expandedCategories.delete(category);
                            content.classList.remove('expanded');
                            toggle.textContent = '▶';
                        } else {
                            expandedCategories.add(category);
                            content.classList.add('expanded');
                            toggle.textContent = '▼';
                        }
                    }
                    
                    // Handle checkbox change
                    function handleCheckboxChange(category, itemName, isChecked) {
                        const item = items[category].find(i => i.name === itemName);
                        if (!item) return;
                        
                        if (isChecked) {
                            installedItems[category].add(itemName);
                            vscode.postMessage({ command: 'installItem', category, item });
                        } else {
                            installedItems[category].delete(itemName);
                            vscode.postMessage({ command: 'removeItem', category, item });
                        }
                        
                        updateBadge(category);
                    }
                    
                    // Render items for a category
                    function renderItems(category) {
                        const content = document.getElementById(category + 'Content');
                        const categoryItems = items[category];
                        
                        if (categoryItems.length === 0) {
                            content.innerHTML = '<div class="empty">No items available</div>';
                            return;
                        }
                        
                        content.innerHTML = categoryItems.map(item => {
                            const isInstalled = installedItems[category].has(item.name);
                            return \`
                                <div class="item">
                                    <input 
                                        type="checkbox" 
                                        id="\${category}-\${item.name}" 
                                        \${isInstalled ? 'checked' : ''}
                                        onchange="handleCheckboxChange('\${category}', '\${item.name}', this.checked)"
                                    />
                                    <label class="item-info" for="\${category}-\${item.name}">
                                        <div class="item-name">\${item.title}</div>
                                        \${item.description ? \`<div class="item-description">\${item.description}</div>\` : ''}
                                    </label>
                                </div>
                            \`;
                        }).join('');
                        
                        updateBadge(category);
                    }
                    
                    // Update badge count
                    function updateBadge(category) {
                        const badge = document.getElementById(category + 'Badge');
                        const installed = installedItems[category].size;
                        const total = items[category].length;
                        badge.textContent = \`\${installed}/\${total}\`;
                    }
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        // Existing message handlers
                        const { version, status, hasWorkspace, isInitialized } = message;
                        if (typeof version !== 'undefined') {
                            document.getElementById('version').textContent = version;
                        }
                        if (typeof status !== 'undefined') {
                            document.getElementById('status').textContent = status;
                        }
                        
                        // Awesome Copilot Library messages
                        if (message.command === 'awesomeItemsLoaded') {
                            items = message.items;
                            installedItems = {
                                agents: new Set(message.installed.agents || []),
                                prompts: new Set(message.installed.prompts || []),
                                instructions: new Set(message.installed.instructions || [])
                            };
                            
                            renderItems('agents');
                            renderItems('prompts');
                            renderItems('instructions');
                        }
                        
                        if (message.command === 'itemInstalled') {
                            installedItems[message.category].add(message.itemName);
                            updateBadge(message.category);
                            // Update checkbox state
                            const checkbox = document.getElementById(\`\${message.category}-\${message.itemName}\`);
                            if (checkbox) checkbox.checked = true;
                        }
                        
                        if (message.command === 'itemRemoved') {
                            installedItems[message.category].delete(message.itemName);
                            updateBadge(message.category);
                            // Update checkbox state
                            const checkbox = document.getElementById(\`\${message.category}-\${message.itemName}\`);
                            if (checkbox) checkbox.checked = false;
                        }
                        
                        if (message.command === 'awesomeItemsError') {
                            ['agents', 'prompts', 'instructions'].forEach(category => {
                                const content = document.getElementById(category + 'Content');
                                content.innerHTML = \`<div class="error">Error loading items: \${message.error}</div>\`;
                            });
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

  public static createOrShow(
    extensionUri: vscode.Uri,
    awesomeCopilotService: AwesomeCopilotService,
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
        awesomeCopilotService,
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
        case "loadAwesomeItems":
          await this._loadAwesomeItems();
          break;
        case "installItem":
          await this._installItem(message.category, message.item);
          break;
        case "removeItem":
          await this._removeItem(message.category, message.item);
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

  private async _loadAwesomeItems() {
    try {
      // Fetch items from GitHub
      const agents = await this._awesomeCopilotService.fetchAgents();
      const prompts = await this._awesomeCopilotService.fetchPrompts();
      const instructions =
        await this._awesomeCopilotService.fetchInstructions();

      // Get installed items
      const installed = await this._contentManager.getInstalledItems();

      // Send to webview
      this._panel.webview.postMessage({
        command: "awesomeItemsLoaded",
        items: {
          agents,
          prompts,
          instructions,
        },
        installed: {
          agents: Array.from(installed.agents),
          prompts: Array.from(installed.prompts),
          instructions: Array.from(installed.instructions),
        },
      });
    } catch (error) {
      console.error("Error loading awesome items:", error);
      this._panel.webview.postMessage({
        command: "awesomeItemsError",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async _installItem(
    category: "agents" | "prompts" | "instructions",
    item: AwesomeCopilotItem
  ) {
    try {
      // Download file content
      const content = await this._awesomeCopilotService.downloadFile(
        item.rawUrl
      );

      // Install file
      await this._contentManager.installFile(category, item.name, content);

      // Notify webview
      this._panel.webview.postMessage({
        command: "itemInstalled",
        category,
        itemName: item.name,
      });
    } catch (error) {
      console.error("Error installing item:", error);
      vscode.window.showErrorMessage(
        `Failed to install ${item.name}: ${error}`
      );
    }
  }

  private async _removeItem(
    category: "agents" | "prompts" | "instructions",
    item: AwesomeCopilotItem
  ) {
    try {
      // Remove file
      await this._contentManager.removeFile(category, item.name);

      // Notify webview
      this._panel.webview.postMessage({
        command: "itemRemoved",
        category,
        itemName: item.name,
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
      const ext = vscode.extensions.getExtension("nexusinno.nexkit-vscode");
      return ext?.packageJSON.version || "Unknown";
    } catch {
      return "Unknown";
    }
  }
}
