import * as vscode from "vscode";
import * as fs from "fs";
import { TelemetryService } from "../../shared/services/telemetryService";
import { AITemplateDataService } from "../ai-template-files/services/aiTemplateDataService";
import { NexkitPanelMessageHandler } from "./nexkitPanelMessageHandler";

/**
 * Provides the Nexkit panel webview and handles its lifecycle
 */
export class NexkitPanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "nexkitPanelView";

  private _view?: vscode.WebviewView;
  private _context?: vscode.ExtensionContext;
  private _messageHandler?: NexkitPanelMessageHandler;

  constructor(private readonly _telemetryService: TelemetryService) {}

  public initialize(context: vscode.ExtensionContext) {
    this._context = context;

    // Initialize message handler
    this._messageHandler = new NexkitPanelMessageHandler(() => this._view, this._telemetryService);

    // Listen for workspace folder changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this._messageHandler?.sendWorkspaceState();
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
      localResourceRoots: [
        vscode.Uri.joinPath(this._context!.extensionUri, "out"),
        vscode.Uri.joinPath(this._context!.extensionUri, "src", "features", "panel-ui", "webview"),
      ],
    };

    // Generate webview HTML
    this._view.webview.html = this.buildWebviewHtml(this._view.webview);

    // Set up message listener - delegate to message handler
    this._view.webview.onDidReceiveMessage(async (message) => {
      await this._messageHandler?.handleMessage(message);
    });
  }

  /**
   * Builds the complete HTML content for the webview
   */
  private buildWebviewHtml(webview: vscode.Webview): string {
    // Get paths to resources
    const htmlPath = vscode.Uri.joinPath(this._context!.extensionUri, "src", "features", "panel-ui", "webview", "index.html");
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context!.extensionUri, "src", "features", "panel-ui", "webview", "styles.css")
    );
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context!.extensionUri, "out", "webview.js"));

    // Generate a nonce for CSP
    const nonce = this.getNonce();

    // Read HTML template
    let html = fs.readFileSync(htmlPath.fsPath, "utf8");

    // Replace placeholders
    html = html.replace(/\{\{nonce\}\}/g, nonce);
    html = html.replace(/\{\{styleUri\}\}/g, styleUri.toString());
    html = html.replace(/\{\{scriptUri\}\}/g, scriptUri.toString());
    html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);

    return html;
  }

  /**
   * Generates a random nonce for CSP
   */
  private getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
