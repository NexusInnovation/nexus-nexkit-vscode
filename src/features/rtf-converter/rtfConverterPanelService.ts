import * as fs from "fs";
import * as vscode from "vscode";

/**
 * Manages the standalone RTF to Markdown converter webview panel
 */
export class RtfConverterPanelService implements vscode.Disposable {
  private static readonly VIEW_TYPE = "nexkitRtfToMarkdown";
  private static readonly PANEL_TITLE = "Nexkit: RTF to Markdown";

  private _panel?: vscode.WebviewPanel;

  public constructor(private readonly _extensionUri: vscode.Uri) {}

  public openPanel(): void {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      RtfConverterPanelService.VIEW_TYPE,
      RtfConverterPanelService.PANEL_TITLE,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "out")],
      }
    );

    this._panel.webview.html = this.buildWebviewHtml(this._panel.webview);
    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });
  }

  public dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  private buildWebviewHtml(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, "out", "rtf-converter", "index.html");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "out", "rtfConverter.js"));
    const nonce = this.getNonce();

    let html: string;
    try {
      html = fs.readFileSync(htmlPath.fsPath, "utf8");
    } catch {
      void vscode.window.showErrorMessage(
        "Unable to load the RTF converter webview. Please rebuild the extension (npm run compile) and try again."
      );
      return "<!DOCTYPE html><html><body><h1>Unable to load RTF converter</h1><p>Please rebuild the extension and try again.</p></body></html>";
    }
    html = html.replace(/\{\{nonce\}\}/g, nonce);
    html = html.replace(/\{\{scriptUri\}\}/g, scriptUri.toString());
    html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);

    return html;
  }

  private getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
