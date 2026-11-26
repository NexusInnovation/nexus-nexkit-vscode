import * as vscode from "vscode";
import { LoggingService } from "../../shared/services/loggingService";
import { DevOpsBuildsClient, DevOpsProjectRef } from "./devOpsBuildsClient";
import { IDevOpsConnectionSource } from "./devOpsPipelinesPanelService";

const ACTIVE_POLL_INTERVAL_MS = 15_000;
const IDLE_POLL_INTERVAL_MS = 45_000;
const STARTUP_DELAY_MS = 5_000;

/**
 * Shows the number of Azure DevOps builds in progress as a badge on the Nexkit activity bar icon.
 * Polls only while the VS Code window is focused and an Azure DevOps project is active.
 */
export class BuildActivityBadgeService implements vscode.Disposable {
  private _view?: vscode.WebviewView;
  private _count = 0;
  private _timer?: NodeJS.Timeout;
  private _refreshing = false;
  private _failing = false;
  private _disposed = false;
  private readonly _listeners: vscode.Disposable[] = [];

  public constructor(
    private readonly _connections: IDevOpsConnectionSource,
    private readonly _client: DevOpsBuildsClient,
    private readonly _logging: LoggingService
  ) {}

  /** Starts monitoring, deferred so it never blocks extension activation */
  public start(): void {
    this._listeners.push(
      this._connections.onConnectionsChanged(() => this._schedule(0)),
      vscode.window.onDidChangeWindowState((state) => (state.focused ? this._schedule(0) : this._clearTimer()))
    );
    this._schedule(STARTUP_DELAY_MS);
  }

  /** Binds the badge to the Nexkit sidebar view (called every time VS Code (re)creates it) */
  public attach(view: vscode.WebviewView): void {
    this._view = view;
    view.onDidDispose(() => {
      if (this._view === view) {
        this._view = undefined;
      }
    });
    this._applyBadge();
  }

  public dispose(): void {
    this._disposed = true;
    this._clearTimer();
    this._listeners.forEach((l) => l.dispose());
    this._listeners.length = 0;
  }

  private _schedule(delayMs: number): void {
    this._clearTimer();
    if (this._disposed || !vscode.window.state.focused) {
      return;
    }
    this._timer = setTimeout(() => void this._refresh(), delayMs);
  }

  private _clearTimer(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  private async _refresh(): Promise<void> {
    if (this._refreshing || this._disposed) {
      return;
    }
    this._refreshing = true;
    try {
      const ref = await this._resolveRef();
      this._setCount(ref ? await this._client.countActiveBuilds(ref) : 0);
      this._failing = false;
    } catch (error) {
      this._setCount(0);
      if (!this._failing) {
        this._failing = true;
        this._logging.warn("Could not refresh the Azure DevOps build badge", error);
      }
    } finally {
      this._refreshing = false;
      this._schedule(this._count > 0 ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS);
    }
  }

  private async _resolveRef(): Promise<DevOpsProjectRef | undefined> {
    const connection = await this._connections.getActiveConnection();
    return connection ? { organization: connection.organization, project: connection.project } : undefined;
  }

  private _setCount(count: number): void {
    if (count === this._count) {
      return;
    }
    this._count = count;
    this._applyBadge();
  }

  private _applyBadge(): void {
    if (!this._view) {
      return;
    }
    this._view.badge =
      this._count > 0
        ? { value: this._count, tooltip: `${this._count} Azure DevOps build${this._count === 1 ? "" : "s"} in progress` }
        : undefined;
  }
}
