/**
 * `squad watch` lifecycle contract (SQD-045, PRD FR-054 / FR-028).
 *
 * Shared, serialisable shapes describing the long-running Ralph monitor started
 * by NexKit: its lifecycle state, the last actionable error and a bounded log
 * buffer. Produced by `SquadWatchService` on the extension host and consumed by
 * the webview (SQD-046 / #261 renders health and logs from this contract).
 *
 * Pure types and constants only — safe to import from the Preact bundle.
 */

import type { SquadError } from "./squadResult";

/** Lifecycle state of the managed `squad watch` process. */
export const SquadWatchState = {
  /** No process is running (never started, or stopped cleanly). */
  Stopped: "stopped",
  /** Spawn requested; waiting for the process to prove it stays up. */
  Starting: "starting",
  /** The process is up and polling. */
  Running: "running",
  /** A stop was requested; waiting for the process to exit. */
  Stopping: "stopping",
  /** The process failed to start, crashed, or could not be stopped. */
  Failed: "failed",
} as const;

export type SquadWatchState = (typeof SquadWatchState)[keyof typeof SquadWatchState];

/** Origin of a {@link SquadWatchLogEntry}. `system` lines are written by NexKit itself. */
export type SquadWatchLogStream = "stdout" | "stderr" | "system";

/** A single, sanitised log line captured from `squad watch` (ANSI codes stripped). */
export interface SquadWatchLogEntry {
  /** Monotonically increasing sequence number; lets consumers de-duplicate appends. */
  seq: number;

  /** Capture time (epoch milliseconds). */
  timestamp: number;

  /** Which stream produced the line. */
  stream: SquadWatchLogStream;

  /** Line text without trailing newline, truncated to {@link SQUAD_WATCH_LOG_MAX_LINE_LENGTH}. */
  text: string;
}

/**
 * Observable health of the managed `squad watch` process.
 *
 * Invariant: {@link error} is non-null only when {@link state} is `failed`, so a
 * failure can never be rendered as a healthy/running state.
 */
export interface SquadWatchStatus {
  /** Current lifecycle state. */
  state: SquadWatchState;

  /** Polling interval (minutes) of the current / last run, or `null` if never started. */
  intervalMinutes: number | null;

  /** When the current / last run was started (epoch ms), or `null`. */
  startedAt: number | null;

  /** When the last run ended (epoch ms), or `null` while running / never started. */
  stoppedAt: number | null;

  /** Exit code of the last run, when it exited normally. */
  exitCode: number | null;

  /** Terminating signal of the last run, when killed by a signal. */
  signal: string | null;

  /** Actionable error when {@link state} is `failed`; `null` otherwise. */
  error: SquadError | null;

  /** Number of lines currently held in the bounded log buffer. */
  logLineCount: number;

  /** Number of older lines evicted from the bounded log buffer. */
  droppedLogLines: number;
}

/** Full status + bounded log snapshot. */
export interface SquadWatchSnapshot {
  status: SquadWatchStatus;
  logs: SquadWatchLogEntry[];
}

/** Maximum number of log lines retained (older lines are evicted first). */
export const SQUAD_WATCH_LOG_BUFFER_MAX_LINES = 500;

/** Maximum length of a single retained log line; longer lines are truncated. */
export const SQUAD_WATCH_LOG_MAX_LINE_LENGTH = 2000;

/** Default polling interval (minutes) — mirrors the Squad CLI default. */
export const SQUAD_WATCH_DEFAULT_INTERVAL_MINUTES = 10;

/** Smallest accepted polling interval (minutes). */
export const SQUAD_WATCH_MIN_INTERVAL_MINUTES = 1;

/** Largest accepted polling interval (minutes) — one day. */
export const SQUAD_WATCH_MAX_INTERVAL_MINUTES = 1440;

/** Initial status before any watch has been started. */
export const initialSquadWatchStatus: SquadWatchStatus = {
  state: SquadWatchState.Stopped,
  intervalMinutes: null,
  startedAt: null,
  stoppedAt: null,
  exitCode: null,
  signal: null,
  error: null,
  logLineCount: 0,
  droppedLogLines: 0,
};
