import * as fs from "fs";
import * as vscode from "vscode";

type JsonFormatterWebviewMessage =
  | { command: "copy"; formattedJson: string }
  | { command: "save"; formattedJson: string };

export interface JsonFormatterPanelActions {
  copyToClipboard(text: string): Promise<void>;
  showSaveDialog(options: vscode.SaveDialogOptions): Promise<vscode.Uri | undefined>;
  writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void>;
  showInformationMessage(message: string): void;
}

const defaultActions: JsonFormatterPanelActions = {
  copyToClipboard: async (text) => vscode.env.clipboard.writeText(text),
  showSaveDialog: async (options) => vscode.window.showSaveDialog(options),
  writeFile: async (uri, content) => vscode.workspace.fs.writeFile(uri, content),
  showInformationMessage: (message) => {
    void vscode.window.showInformationMessage(message);
  },
};

export class JsonFormatterPanelService implements vscode.Disposable {
  private static readonly VIEW_TYPE = "nexkitJsonFormatter";
  private static readonly PANEL_TITLE = "Nexkit: JSON Formatter";

  private _panel?: vscode.WebviewPanel;

  public constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _actions: JsonFormatterPanelActions = defaultActions
  ) {}

  public openPanel(): void {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      JsonFormatterPanelService.VIEW_TYPE,
      JsonFormatterPanelService.PANEL_TITLE,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "out")],
      }
    );

    this._panel.webview.html = this.buildWebviewHtml(this._panel.webview);
    this._panel.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message));
    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });
  }

  public dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!this.isWebviewMessage(message)) {
      return;
    }

    if (message.command === "copy") {
      await this._actions.copyToClipboard(message.formattedJson);
      this._actions.showInformationMessage("Formatted JSON copied to clipboard.");
      return;
    }

    const uri = await this._actions.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? this._extensionUri, "formatted.json"),
      filters: { JSON: ["json"] },
      saveLabel: "Save formatted JSON",
    });
    if (!uri) {
      return;
    }

    await this._actions.writeFile(uri, Buffer.from(message.formattedJson, "utf8"));
    this._actions.showInformationMessage("Formatted JSON saved.");
  }

  private isWebviewMessage(message: unknown): message is JsonFormatterWebviewMessage {
    if (!message || typeof message !== "object") {
      return false;
    }

    const candidate = message as { command?: unknown; formattedJson?: unknown };
    return (candidate.command === "copy" || candidate.command === "save") && typeof candidate.formattedJson === "string";
  }

  private buildWebviewHtml(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, "out", "json-formatter", "index.html");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "out", "jsonFormatter.js"));
    const nonce = this.getNonce();

    let html: string;
    try {
      html = fs.readFileSync(htmlPath.fsPath, "utf8");
    } catch {
      void vscode.window.showErrorMessage(
        "Unable to load the JSON Formatter webview. Please rebuild the extension (npm run compile) and try again."
      );
      return "<!DOCTYPE html><html><body><h1>Unable to load JSON Formatter</h1><p>Please rebuild the extension and try again.</p></body></html>";
    }
    html = html.replace(/\{\{nonce\}\}/g, nonce);
    html = html.replace(/\{\{scriptUri\}\}/g, scriptUri.toString());
    html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);

    return html;
  }

  private getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let index = 0; index < 32; index++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}