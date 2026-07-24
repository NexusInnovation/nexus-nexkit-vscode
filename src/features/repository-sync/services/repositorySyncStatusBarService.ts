import * as vscode from "vscode";
import { Commands } from "../../../shared/constants/commands";
import { RepositorySyncRunResult } from "../models/repositorySyncModels";

type RepositorySyncStatusBarState = "idle" | "running" | "warning" | "error";

export class RepositorySyncStatusBarService implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private _lastRunSummary = "No runs yet.";

  public constructor() {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    this._statusBarItem.command = Commands.REPOSITORY_SYNC_RUN_ONCE;
    this._statusBarItem.name = "Nexkit Repository Sync";
    this._setState("idle");
  }

  public show(): void {
    this._statusBarItem.show();
  }

  public hide(): void {
    this._statusBarItem.hide();
  }

  public updateLastRun(runResult: RepositorySyncRunResult): void {
    this._lastRunSummary =
      `Processed ${runResult.processedCount}/${runResult.plannedCount} planned repositories ` +
      `(${runResult.summary.successReady} ready, ${runResult.summary.skipped} skipped, ` +
      `${runResult.summary.conflictRisk} warning, ${runResult.summary.failed} failed).`;

    if (runResult.summary.failed > 0) {
      this._setState("error");
      return;
    }

    if (runResult.summary.conflictRisk > 0) {
      this._setState("warning");
      return;
    }

    this._setState("idle");
  }

  public setRunning(): void {
    this._setState("running");
  }

  public dispose(): void {
    this._statusBarItem.dispose();
  }

  private _setState(state: RepositorySyncStatusBarState): void {
    if (state === "running") {
      this._statusBarItem.text = "$(sync~spin) Repo Sync";
      this._statusBarItem.tooltip = `Repository sync running. ${this._lastRunSummary}`;
      this._statusBarItem.backgroundColor = undefined;
      return;
    }

    if (state === "warning") {
      this._statusBarItem.text = "$(warning) Repo Sync";
      this._statusBarItem.tooltip = `Repository sync completed with warnings. ${this._lastRunSummary}`;
      this._statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      return;
    }

    if (state === "error") {
      this._statusBarItem.text = "$(error) Repo Sync";
      this._statusBarItem.tooltip = `Repository sync completed with errors. ${this._lastRunSummary}`;
      this._statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      return;
    }

    this._statusBarItem.text = "$(sync) Repo Sync";
    this._statusBarItem.tooltip = `Run Nexkit repository sync. ${this._lastRunSummary}`;
    this._statusBarItem.backgroundColor = undefined;
  }
}
