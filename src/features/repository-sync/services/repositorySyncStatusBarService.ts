import * as vscode from "vscode";
import { Commands } from "../../../shared/constants/commands";
import { RepositorySyncRunResult } from "../models/repositorySyncModels";

type RepositorySyncStatusBarState = "idle" | "running" | "warning" | "error";

export class RepositorySyncStatusBarService implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private _lastRunSummary = "No runs yet.";
  private _lastRunTimestamp: string | undefined;
  private _lastTriggerReason: string | undefined;

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

  public updateLastRun(runResult: RepositorySyncRunResult, triggerReason?: string): void {
    this._lastRunSummary =
      `Processed ${runResult.processedCount}/${runResult.plannedCount} planned repositories ` +
      `(${runResult.summary.successReady} ready, ${runResult.summary.skipped} skipped, ` +
      `${runResult.summary.conflictRisk} warning, ${runResult.summary.failed} failed).`;
    this._lastRunTimestamp = new Date(runResult.completedAt).toLocaleString();
    this._lastTriggerReason = triggerReason;

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

  public setIdle(): void {
    this._setState("idle");
  }

  public dispose(): void {
    this._statusBarItem.dispose();
  }

  private _setState(state: RepositorySyncStatusBarState): void {
    if (state === "running") {
      this._statusBarItem.text = "$(sync~spin) Repo Sync";
      this._statusBarItem.tooltip = `Repository sync running. ${this._getTooltipContext()}`;
      this._statusBarItem.backgroundColor = undefined;
      return;
    }

    if (state === "warning") {
      this._statusBarItem.text = "$(warning) Repo Sync";
      this._statusBarItem.tooltip = `Repository sync completed with warnings. ${this._getTooltipContext()}`;
      this._statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      return;
    }

    if (state === "error") {
      this._statusBarItem.text = "$(error) Repo Sync";
      this._statusBarItem.tooltip = `Repository sync completed with errors. ${this._getTooltipContext()}`;
      this._statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      return;
    }

    this._statusBarItem.text = "$(sync) Repo Sync";
    this._statusBarItem.tooltip = `Run Nexkit repository sync. ${this._getTooltipContext()}`;
    this._statusBarItem.backgroundColor = undefined;
  }

  private _getTooltipContext(): string {
    const timestampLabel = this._lastRunTimestamp ? `Last run: ${this._lastRunTimestamp}. ` : "";
    const triggerLabel = this._lastTriggerReason ? `Trigger: ${this._lastTriggerReason}. ` : "";
    return `${timestampLabel}${triggerLabel}${this._lastRunSummary}`;
  }
}
