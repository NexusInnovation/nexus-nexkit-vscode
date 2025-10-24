import * as vscode from 'vscode';

export class NexkitPanel {
    public static currentPanel: NexkitPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;

    public static readonly viewType = 'nexkitCustomView';

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.webview.html = this._getHtmlForWebview();
        this._setWebviewMessageListener();
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
                    .static-info { background: #f3f3f3; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
                    .actions { display: flex; gap: 12px; }
                    button { padding: 8px 16px; font-size: 1em; border-radius: 4px; border: none; background: #007acc; color: white; cursor: pointer; }
                    button:hover { background: #005fa3; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="static-info">
                        <h2>Nexkit Extension</h2>
                        <p>Version: <span id="version">Loading...</span></p>
                        <p>Status: <span id="status">Ready</span></p>
                    </div>
                    <div class="actions">
                        <button onclick="vscode.postMessage({ command: 'updateTemplates' })">Update Nexkit Templates</button>
                        <button onclick="vscode.postMessage({ command: 'initProject' })">Re-initialize Project</button>
                        <button onclick="vscode.postMessage({ command: 'installUserMCPs' })">Install User MCP Servers</button>
                        <button onclick="vscode.postMessage({ command: 'openSettings' })">Open Settings</button>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                </script>
            </body>
            </html>
        `;
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.ViewColumn.One;
        if (NexkitPanel.currentPanel) {
            NexkitPanel.currentPanel._panel.reveal(column);
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
        // Static info at top, buttons below
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
                    .static-info { background: #f3f3f3; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
                    .actions { display: flex; gap: 12px; }
                    button { padding: 8px 16px; font-size: 1em; border-radius: 4px; border: none; background: #007acc; color: white; cursor: pointer; }
                    button:hover { background: #005fa3; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="static-info">
                        <h2>Nexkit Extension</h2>
                        <p>Version: <span id="version">Loading...</span></p>
                        <p>Status: <span id="status">Ready</span></p>
                    </div>
                    <div class="actions">
                        <button onclick="vscode.postMessage({ command: 'updateTemplates' })">Update Nexkit Templates</button>
                        <button onclick="vscode.postMessage({ command: 'initProject' })">Re-initialize Project</button>
                        <button onclick="vscode.postMessage({ command: 'installUserMCPs' })">Install User MCP Servers</button>
                        <button onclick="vscode.postMessage({ command: 'openSettings' })">Open Settings</button>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                </script>
            </body>
            </html>
        `;
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'updateTemplates':
                        vscode.commands.executeCommand('nexkit-vscode.updateTemplates');
                        break;
                    case 'initProject':
                        vscode.commands.executeCommand('nexkit-vscode.initProject');
                        break;
                    case 'installUserMCPs':
                        vscode.commands.executeCommand('nexkit-vscode.installUserMCPs');
                        break;
                    case 'openSettings':
                        vscode.commands.executeCommand('nexkit-vscode.openSettings');
                        break;
                }
            },
            undefined
        );
    }
}
