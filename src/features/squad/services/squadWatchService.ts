import * as vscode from "vscode";
import { SettingsManager } from "../../../core/settingsManager";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  initialSquadWatchStatus,
  SQUAD_WATCH_LOG_BUFFER_MAX_LINES,
  SQUAD_WATCH_LOG_MAX_LINE_LENGTH,
  SQUAD_WATCH_MAX_INTERVAL_MINUTES,
  SQUAD_WATCH_MIN_INTERVAL_MINUTES,
  SquadError,
  squadErr,
  squadOk,
  SquadResult,
  SquadWatchLogEntry,
  SquadWatchLogStream,
  SquadWatchSnapshot,
  SquadWatchState,
  SquadWatchStatus,
} from "../models";
import { SquadCliCommand, SquadCliService } from "./squadCliService";
import { SquadLongRunningHandle } from "./squadLongRunningProcess";

/** Options accepted when starting `squad watch`. */
export interface SquadWatchStartOptions {
  /** Workspace root used as the process cwd. */
  cwd?: vscode.Uri;

  /** Polling interval in minutes; defaults to `nexkit.squad.watch.defaultIntervalMinutes`. */
  intervalMinutes?: number;
}

/** Options accepted when stopping `squad watch`. */
export interface SquadWatchStopOptions {
  /** Force termination instead of a graceful SIGTERM. */
  force?: boolean;
}

/** Constructor seams for deterministic tests. */
export interface SquadWatchServiceOptions {
  /** Safe Squad CLI wrapper. */
  cli: SquadCliService;

  /** Logger. Defaults to the shared logging singleton. */
  logger?: LoggingService;

  /** Clock seam for timestamps. */
  now?: () => number;

  /** Default interval provider. Defaults to SettingsManager. */
  getDefaultIntervalMinutes?: () => number;
}

/**
 * Owns the long-running `squad watch` lifecycle (SQD-045 / FR-054).
 *
 * The service never starts work during activation. It only spawns the allowlisted
 * CLI command when requested, keeps a bounded sanitized log buffer, publishes a
 * serialisable snapshot for the panel, and kills the process on disposal.
 */
export class SquadWatchService implements vscode.Disposable {
  private readonly _cli: SquadCliService;
  private readonly _logger: LoggingService;
  private readonly _now: () => number;
  private readonly _getDefaultIntervalMinutes: () => number;
  private readonly _onDidChangeSnapshot = new vscode.EventEmitter<SquadWatchSnapshot>();
  private _status: SquadWatchStatus = { ...initialSquadWatchStatus };
  private _logs: SquadWatchLogEntry[] = [];
  private _nextSeq = 1;
  private _droppedLogLines = 0;
  private _handle: SquadLongRunningHandle | null = null;
  private _stdoutPartial = "";
  private _stderrPartial = "";
  private _stopRequested = false;
  private _disposed = false;

  /** Emits the full status + bounded log snapshot after every state/log change. */
  public readonly onDidChangeSnapshot: vscode.Event<SquadWatchSnapshot> = this._onDidChangeSnapshot.event;

  constructor(options: SquadWatchServiceOptions) {
    this._cli = options.cli;
    this._logger = options.logger ?? LoggingService.getInstance();
    this._now = options.now ?? Date.now;
    this._getDefaultIntervalMinutes =
      options.getDefaultIntervalMinutes ?? (() => SettingsManager.getSquadWatchDefaultIntervalMinutes());
  }

  /** Return the current serialisable status + bounded log snapshot. */
  public getSnapshot(): SquadWatchSnapshot {
    return {
      status: { ...this._status },
      logs: this._logs.map((entry) => ({ ...entry })),
    };
  }

  /** Start the managed `squad watch` process. */
  public start(options: SquadWatchStartOptions = {}): SquadResult<SquadWatchSnapshot> {
    if (this._isActive()) {
      return squadErr({
        code: "watch-already-running",
        message: "Squad watch is already running.",
        remediation: "Stop the current Squad watch process before starting another one.",
      });
    }

    const intervalMinutes = options.intervalMinutes ?? this._getDefaultIntervalMinutes();
    const validation = this._validateInterval(intervalMinutes);
    if (!validation.ok) {
      this._transitionToFailed(validation.error);
      return squadErr(validation.error);
    }

    if (!options.cwd) {
      const error: SquadError = {
        code: "not-a-workspace",
        message: "Squad watch requires an open workspace.",
        remediation: "Open a Squad workspace folder, then start Squad watch again.",
      };
      this._transitionToFailed(error);
      return squadErr(error);
    }

    this._stopRequested = false;
    this._stdoutPartial = "";
    this._stderrPartial = "";
    this._status = {
      ...initialSquadWatchStatus,
      state: SquadWatchState.Starting,
      intervalMinutes,
      startedAt: this._now(),
      logLineCount: this._logs.length,
      droppedLogLines: this._droppedLogLines,
    };
    this._appendSystemLog(`Starting squad watch (interval=${intervalMinutes}m).`);
    this._emitSnapshot();

    const result = this._cli.spawnLongRunning(
      SquadCliCommand.Watch,
      {
        cwd: options.cwd,
        args: ["--interval", String(intervalMinutes)],
      },
      {
        onSpawn: () => this._handleSpawn(),
        onStdout: (chunk) => this._captureLogChunk("stdout", chunk),
        onStderr: (chunk) => this._captureLogChunk("stderr", chunk),
        onError: (errorCode) => this._handleSpawnError(errorCode),
        onExit: (exitCode, signal) => this._handleExit(exitCode, signal),
      }
    );

    if (!result.ok) {
      this._transitionToFailed(this._withoutCause(result.error));
      return result;
    }

    this._handle = result.value;
    return squadOk(this.getSnapshot());
  }

  /** Stop the managed `squad watch` process. */
  public stop(options: SquadWatchStopOptions = {}): SquadResult<SquadWatchSnapshot> {
    if (!this._handle) {
      return squadErr({
        code: "watch-not-running",
        message: "Squad watch is not running.",
        remediation: "Start Squad watch before trying to stop it.",
      });
    }

    if (this._status.state === SquadWatchState.Stopping) {
      if (options.force) {
        this._appendSystemLog("Forcing squad watch to stop.");
        this._handle.kill(true);
        this._emitSnapshot();
      }
      return squadOk(this.getSnapshot());
    }

    this._stopRequested = true;
    this._status = {
      ...this._status,
      state: SquadWatchState.Stopping,
      error: null,
    };
    this._appendSystemLog(options.force ? "Forcing squad watch to stop." : "Stopping squad watch.");
    this._emitSnapshot();
    this._handle.kill(options.force === true);
    return squadOk(this.getSnapshot());
  }

  /** Dispose kills any running process so VS Code shutdown never leaves orphans. */
  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this._handle) {
      try {
        this._handle.kill(true);
      } finally {
        this._handle = null;
      }
    }
    this._onDidChangeSnapshot.dispose();
  }

  private _isActive(): boolean {
    return (
      this._handle !== null ||
      this._status.state === SquadWatchState.Starting ||
      this._status.state === SquadWatchState.Running ||
      this._status.state === SquadWatchState.Stopping
    );
  }

  private _validateInterval(intervalMinutes: number): SquadResult<number> {
    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < SQUAD_WATCH_MIN_INTERVAL_MINUTES ||
      intervalMinutes > SQUAD_WATCH_MAX_INTERVAL_MINUTES
    ) {
      return squadErr({
        code: "invalid-input",
        message: "The Squad watch interval is invalid.",
        remediation: `Choose a whole number between ${SQUAD_WATCH_MIN_INTERVAL_MINUTES} and ${SQUAD_WATCH_MAX_INTERVAL_MINUTES} minutes.`,
        detail: `intervalMinutes=${String(intervalMinutes)}`,
      });
    }
    return squadOk(intervalMinutes);
  }

  private _handleSpawn(): void {
    if (this._status.state !== SquadWatchState.Starting) {
      return;
    }
    this._status = {
      ...this._status,
      state: SquadWatchState.Running,
      error: null,
    };
    this._appendSystemLog("Squad watch is running.");
    this._emitSnapshot();
  }

  private _handleSpawnError(errorCode: string): void {
    const error: SquadError =
      errorCode === "ENOENT"
        ? {
            code: "cli-not-found",
            message: "Squad watch could not start because the Squad CLI was not found.",
            remediation: "Verify the configured Squad CLI source, then start Squad watch again.",
            detail: `spawnErrorCode=${errorCode}`,
          }
        : {
            code: "watch-failed",
            message: "Squad watch failed to start.",
            remediation: "Review the Squad watch logs, resolve the reported issue, then start it again.",
            detail: `spawnErrorCode=${errorCode}`,
          };
    this._transitionToFailed(error);
  }

  private _handleExit(exitCode: number | null, signal: string | null): void {
    this._flushPartialLogs();

    const wasStopping = this._status.state === SquadWatchState.Stopping || this._stopRequested;
    this._handle = null;
    this._stopRequested = false;

    if (this._status.state === SquadWatchState.Failed && !wasStopping) {
      return;
    }

    if (wasStopping || exitCode === 0) {
      this._status = {
        ...this._status,
        state: SquadWatchState.Stopped,
        stoppedAt: this._now(),
        exitCode,
        signal,
        error: null,
      };
      this._appendSystemLog("Squad watch stopped.");
      this._emitSnapshot();
      return;
    }

    this._transitionToFailed({
      code: "watch-failed",
      message: "Squad watch exited unexpectedly.",
      remediation: "Review the Squad watch logs, resolve the reported issue, then start it again.",
      detail: `exitCode=${exitCode ?? "null"} signal=${signal ?? "null"}`,
    });
  }

  private _transitionToFailed(error: SquadError): void {
    this._logger.warn("Squad watch failed", error);
    this._handle = null;
    this._stopRequested = false;
    this._status = {
      ...this._status,
      state: SquadWatchState.Failed,
      stoppedAt: this._now(),
      error: this._withoutCause(error),
    };
    this._appendSystemLog(error.message);
    this._emitSnapshot();
  }

  private _captureLogChunk(stream: Exclude<SquadWatchLogStream, "system">, chunk: string): void {
    const combined = (stream === "stdout" ? this._stdoutPartial : this._stderrPartial) + chunk;
    const lines = combined.split(/\r?\n/);
    const partial = lines.pop() ?? "";
    if (stream === "stdout") {
      this._stdoutPartial = partial;
    } else {
      this._stderrPartial = partial;
    }

    for (const line of lines) {
      this._appendLog(stream, line);
    }
    this._emitSnapshot();
  }

  private _flushPartialLogs(): void {
    if (this._stdoutPartial.length > 0) {
      this._appendLog("stdout", this._stdoutPartial);
      this._stdoutPartial = "";
    }
    if (this._stderrPartial.length > 0) {
      this._appendLog("stderr", this._stderrPartial);
      this._stderrPartial = "";
    }
  }

  private _appendSystemLog(text: string): void {
    this._appendLog("system", text);
  }

  private _appendLog(stream: SquadWatchLogStream, text: string): void {
    const sanitized = this._sanitizeLogLine(text);
    this._logs.push({
      seq: this._nextSeq++,
      timestamp: this._now(),
      stream,
      text: sanitized,
    });

    while (this._logs.length > SQUAD_WATCH_LOG_BUFFER_MAX_LINES) {
      this._logs.shift();
      this._droppedLogLines++;
    }

    this._status = {
      ...this._status,
      logLineCount: this._logs.length,
      droppedLogLines: this._droppedLogLines,
    };
  }

  private _sanitizeLogLine(text: string): string {
    const withoutAnsi = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
    if (withoutAnsi.length <= SQUAD_WATCH_LOG_MAX_LINE_LENGTH) {
      return withoutAnsi;
    }
    return `${withoutAnsi.slice(0, SQUAD_WATCH_LOG_MAX_LINE_LENGTH - 3)}...`;
  }

  private _withoutCause(error: SquadError): SquadError {
    const { cause: _cause, ...serialisable } = error;
    return serialisable;
  }

  private _emitSnapshot(): void {
    if (!this._disposed) {
      this._onDidChangeSnapshot.fire(this.getSnapshot());
    }
  }
}
