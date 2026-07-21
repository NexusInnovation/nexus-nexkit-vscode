import * as fs from "fs";
import * as vscode from "vscode";
import { IMarkitdownConversionService } from "./markitdownConversionService";
import { HostToWebviewMessage, WebviewToHostMessage } from "./messages";

/**
 * Manages the standalone Convert to Markdown webview panel
 */
export class ConvertToMarkdownPanelService implements vscode.Disposable {
  private static readonly VIEW_TYPE = "nexkitConvertToMarkdown";
  private static readonly PANEL_TITLE = "Nexkit: Convert to Markdown";

  private _panel?: vscode.WebviewPanel;

  public constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _markitdownConversion: IMarkitdownConversionService
  ) {}

  public openPanel(): void {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      ConvertToMarkdownPanelService.VIEW_TYPE,
      ConvertToMarkdownPanelService.PANEL_TITLE,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "out")],
      }
    );

    this._panel.webview.html = this.buildWebviewHtml(this._panel.webview);

    const messageListener = this._panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
      void this._handleWebviewMessage(message);
    });

    this._panel.onDidDispose(() => {
      messageListener.dispose();
      this._panel = undefined;
    });
  }

  public dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  private async _handleWebviewMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case "webview-ready":
        await this._postAvailabilityStatus();
        break;
      case "recheck-availability":
        this._markitdownConversion.invalidateAvailabilityCache();
        await this._postAvailabilityStatus();
        break;
      case "convert-paste-html":
        await this._convertAndRespond(() => this._markitdownConversion.convertHtml(message.html), "Pasted HTML");
        break;
      case "convert-paste-text":
        await this._convertAndRespond(() => this._markitdownConversion.convertText(message.text), "Pasted text");
        break;
      case "convert-file":
        await this._convertAndRespond(
          () => this._markitdownConversion.convertFile(message.fileName, message.data),
          message.fileName
        );
        break;
    }
  }

  private async _postAvailabilityStatus(): Promise<void> {
    const availability = await this._markitdownConversion.checkAvailability();
    this._postMessage({
      type: "availability-status",
      available: availability.available,
      reason: availability.reason,
    });
  }

  private async _convertAndRespond(convert: () => Promise<string>, sourceLabel: string): Promise<void> {
    try {
      const markdown = await convert();
      this._postMessage({ type: "conversion-result", markdown, sourceLabel });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Conversion failed.";
      this._postMessage({ type: "conversion-error", message });
    }
  }

  private _postMessage(message: HostToWebviewMessage): void {
    void this._panel?.webview.postMessage(message);
  }

  private buildWebviewHtml(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, "out", "convert-to-markdown", "index.html");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "out", "convertToMarkdown.js"));
    const nonce = this.getNonce();

    let html: string;
    try {
      html = fs.readFileSync(htmlPath.fsPath, "utf8");
    } catch {
      void vscode.window.showErrorMessage(
        "Unable to load the Convert to Markdown webview. Please rebuild the extension (npm run compile) and try again."
      );
      return "<!DOCTYPE html><html><body><h1>Unable to load Convert to Markdown</h1><p>Please rebuild the extension and try again.</p></body></html>";
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
