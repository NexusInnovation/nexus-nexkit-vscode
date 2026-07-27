import * as vscode from "vscode";

export class RepositorySyncOutputService implements vscode.Disposable {
  private readonly _outputChannel: vscode.OutputChannel;

  public constructor() {
    this._outputChannel = vscode.window.createOutputChannel("Nexkit Repository Sync");
  }

  public appendLine(message: string): void {
    this._outputChannel.appendLine(message);
  }

  public appendBlock(lines: string[]): void {
    for (const line of lines) {
      this._outputChannel.appendLine(line);
    }
  }

  public clear(): void {
    this._outputChannel.clear();
  }

  public show(preserveFocus = false): void {
    this._outputChannel.show(preserveFocus);
  }

  public dispose(): void {
    this._outputChannel.dispose();
  }
}
