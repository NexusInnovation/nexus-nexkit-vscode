import * as vscode from 'vscode';

export class NexkitPanel {
    public static currentPanel: NexkitPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;

    public static readonly viewType = 'nexkitCustomView';

    private _version: string = 'Loading...';
    private _status: string = 'Ready';

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.webview.html = this._getHtmlForWebview();
        this._setWebviewMessageListener();
        // Don't send version/status yet - wait for webview to signal it's ready
    }

    private async _initializeVersionStatus() {
        this._version = await this._getExtensionVersion();
        this._status = 'Ready';
        this._postVersionStatus();
    }

    public async refresh() {
        await this._initializeVersionStatus();
    }

    // Helper to get HTML for a webview (static so other providers can use it)
    public static getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
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
                        <button id="initializeProjectBtn" onclick="vscode.postMessage({ command: 'initProject' })">Initialize Project</button>
                        <button id="reinitializeProjectBtn" onclick="vscode.postMessage({ command: 'reinitializeProject' })" disabled>Re-initialize Project</button>
                        <button id="updateTemplatesBtn" onclick="vscode.postMessage({ command: 'updateTemplates' })" disabled>Update Nexkit Templates</button>
                        <button id="installUserMCPsBtn" onclick="vscode.postMessage({ command: 'installUserMCPs' })">Install User MCP Servers</button>
                        <button id="openSettingsBtn" onclick="vscode.postMessage({ command: 'openSettings' })">Open Settings</button>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const { version, status, hasWorkspace } = event.data;
                        if (typeof version !== 'undefined') {
                            document.getElementById('version').textContent = version;
                        }
                        if (typeof status !== 'undefined') {
                            document.getElementById('status').textContent = status;
                        }
                        if (typeof hasWorkspace !== 'undefined') {
                            // Enable/disable workspace-dependent buttons
                            const updateTemplatesBtn = document.getElementById('updateTemplatesBtn');
                            const reinitializeProjectBtn = document.getElementById('reinitializeProjectBtn');
                            if (updateTemplatesBtn) {
                                updateTemplatesBtn.disabled = !hasWorkspace;
                            }
                            if (initializeProjectBtn) {
                                initializeProjectBtn.disabled = !hasWorkspace;
                            }
                            if (reinitializeProjectBtn) {
                                reinitializeProjectBtn.disabled = !hasWorkspace;
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
                'Nexkit Info & Actions',
                column,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            NexkitPanel.currentPanel = new NexkitPanel(panel, extensionUri);
        }
    }

    private _getHtmlForWebview(): string {
        return NexkitPanel.getWebviewContent(this._panel.webview, this._extensionUri);
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'ready':
                        // Webview is ready to receive messages
                        await this._initializeVersionStatus();
                        // Also send workspace state
                        const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
                        this._panel.webview.postMessage({ hasWorkspace });
                        break;
                    case 'initProject':
                        await vscode.commands.executeCommand('nexkit-vscode.initProject');
                        this._status = 'Project initialized';
                        this._version = await this._getExtensionVersion();
                        this._postVersionStatus();
                        break;
                    case 'updateTemplates':
                        await vscode.commands.executeCommand('nexkit-vscode.updateTemplates');
                        this._status = 'Templates updated';
                        this._version = await this._getExtensionVersion();
                        this._postVersionStatus();
                        break;
                    case 'reinitializeProject':
                        await vscode.commands.executeCommand('nexkit-vscode.reinitializeProject');
                        this._status = 'Project re-initialized';
                        this._version = await this._getExtensionVersion();
                        this._postVersionStatus();
                        break;
                    case 'installUserMCPs':
                        await vscode.commands.executeCommand('nexkit-vscode.installUserMCPs');
                        this._status = 'User MCP servers installed';
                        this._postVersionStatus();
                        break;
                    case 'openSettings':
                        await vscode.commands.executeCommand('nexkit-vscode.openSettings');
                        this._status = 'Settings opened';
                        this._postVersionStatus();
                        break;
                }
            },
            undefined
        );
    }

    private _postVersionStatus() {
        this._panel.webview.postMessage({ version: this._version, status: this._status });
    }

    private async _getExtensionVersion(): Promise<string> {
        try {
            const ext = vscode.extensions.getExtension('nexusinno.nexkit-vscode');
            return ext?.packageJSON.version || 'Unknown';
        } catch {
            return 'Unknown';
        }
    }
}
