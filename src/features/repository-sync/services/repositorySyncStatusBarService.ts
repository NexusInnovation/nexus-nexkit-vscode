import * as vscode from "vscode";
import { Commands } from "../../../shared/constants/commands";
import { RepositorySyncRunResult } from "../models/repositorySyncModels";

export class RepositorySyncStatusBarService implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;

  public constructor() {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    this._statusBarItem.command = Commands.REPOSITORY_SYNC_RUN_ONCE;
    this._statusBarItem.name = "Nexkit Repository Sync";
    this._statusBarItem.text = "$(sync) Repo Sync";
    this._statusBarItem.tooltip = "Run Nexkit repository sync";
  }

  public show(): void {
    this._statusBarItem.show();
  }

  public hide(): void {
    this._statusBarItem.hide();
  }

  public updateLastRun(runResult: RepositorySyncRunResult): void {
    const successCount = runResult.results.filter((result) => result.success).length;
    this._statusBarItem.text = `$(sync) Repo Sync ${successCount}/${runResult.results.length}`;
    this._statusBarItem.tooltip = `Last sync processed ${runResult.results.length} repositories.`;
  }

  public dispose(): void {
    this._statusBarItem.dispose();
  }
}
