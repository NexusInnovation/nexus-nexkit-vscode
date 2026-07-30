import * as vscode from "vscode";

/**
 * The three orchestrated phases. Each maps to exactly one allowlisted script
 * filename per platform (see `scriptResolver.ts`).
 */
export type PrerequisiteStep = "check" | "validate" | "setup";

/**
 * Terminal outcome of a single process execution.
 *
 * `scriptNotFound`, `spawnFailed`, and `cancelled` MUST never be collapsed into
 * `outcome: "completed", exitCode: 1`. A missing `check-validation` script is a
 * broken setup, not a "prerequisites are not validated" answer, and the
 * orchestrator reports the two very differently.
 */
export type ScriptRunOutcome = "completed" | "timedOut" | "scriptNotFound" | "spawnFailed" | "cancelled";

/**
 * Result of one process execution. Returned by {@link IProcessRunner.run} and
 * carried unchanged through {@link StepExecution}.
 */
export interface ScriptRunResult {
  /** Authoritative terminal state. Always inspect this before `exitCode`. */
  outcome: ScriptRunOutcome;
  /** Process exit code. `null` when the process was killed or never started. */
  exitCode: number | null;
  /** Captured stdout, capped at `maxOutputBytes`. */
  stdout: string;
  /** Captured stderr, capped at `maxOutputBytes`. */
  stderr: string;
  /** Wall-clock duration measured with the injected clock. */
  durationMs: number;
  /** True when stdout or stderr exceeded the cap and older bytes were dropped. */
  truncated: boolean;
  /** Populated for `spawnFailed` and `scriptNotFound`; never surfaced verbatim to the user. */
  failureReason?: string;
  /**
   * True when the kill request could not be extended to the process tree, so a
   * descendant installer (winget/brew/apt) may still be running. Surfaced to the
   * user on cancellation rather than hidden.
   */
  descendantsMaySurvive?: boolean;
}

export interface ProcessRunOptions {
  cwd: string;
  timeoutMs: number;
  /** Grace period between SIGTERM and SIGKILL. */
  killGraceMs: number;
  env?: NodeJS.ProcessEnv;
  cancellationToken?: vscode.CancellationToken;
  /** Ring-buffer cap applied independently to stdout and stderr. */
  maxOutputBytes?: number;
}

/**
 * The single process-execution seam. `PrerequisiteRunnerService` and
 * `PrerequisiteOrchestratorService` depend on this and never on `child_process`.
 * Only `NodeProcessRunner` may import `child_process`.
 */
export interface IProcessRunner {
  run(command: string, args: string[], options: ProcessRunOptions): Promise<ScriptRunResult>;
}

/** Injected time source so duration and timestamp assertions are deterministic. */
export interface IClock {
  now(): number;
}

/** Injected timer source so timeout paths are testable without real waiting. */
export interface ITimers {
  setTimeout(handler: () => void, ms: number): NodeJS.Timeout;
  clearTimeout(handle: NodeJS.Timeout | undefined): void;
}

/**
 * Structural logger seam. `LoggingService` satisfies this, and tests can assert
 * the log contract without an output channel.
 */
export interface IPrerequisiteLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}

/** Filesystem seam for config loading and path containment checks. */
export interface IFileSystem {
  fileExists(fsPath: string): Promise<boolean>;
  readTextFile(fsPath: string): Promise<string>;
  /** Resolves symlinks. Used to defeat symlink-based path escapes. */
  realPath(fsPath: string): Promise<string>;
  /**
   * Byte size of a file, so an oversized config can be rejected before it is
   * ever read into memory. Optional: implementations that cannot cheaply stat
   * may omit it, and callers then fall back to the post-read cap.
   */
  fileSizeBytes?(fsPath: string): Promise<number>;
}

export const systemClock: IClock = {
  now: () => Date.now(),
};

export const systemTimers: ITimers = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => {
    if (handle) {
      clearTimeout(handle);
    }
  },
};

/**
 * Error taxonomy. The category is the only error detail forwarded to telemetry.
 */
export type PrerequisiteErrorCategory =
  | "Trust"
  | "Configuration"
  | "NotFound"
  | "Permission"
  | "Execution"
  | "Timeout"
  | "Cancelled"
  | "Concurrency";

export class PrerequisiteError extends Error {
  public constructor(
    public readonly category: PrerequisiteErrorCategory,
    message: string,
    public readonly remediation?: string
  ) {
    super(message);
    this.name = "PrerequisiteError";
  }

  /** Single-line message suitable for a notification. */
  public toUserMessage(): string {
    return this.remediation ? `${this.message} ${this.remediation}` : this.message;
  }
}

/**
 * Install metadata from `requirements.json`.
 *
 * These strings are DISPLAY-ONLY. They originate from the workspace and the
 * shipped sample already contains a shell chain operator. They must never be
 * interpolated into a command line, passed to a shell, or sent to a terminal.
 */
export interface PrerequisiteInstallInfo {
  winget?: string;
  npm?: string;
  hint?: string;
  url?: string;
}

export interface Prerequisite {
  name: string;
  command: string;
  versionCommand?: string;
  required: boolean;
  minimumVersion?: string;
  install?: PrerequisiteInstallInfo;
}

export interface PrerequisiteConfig {
  prerequisites: Prerequisite[];
}

/**
 * Config lookup result. A workspace with no `requirements.json` is the common
 * case and resolves to `absent` — a calm no-op, never an error.
 */
export type ConfigLoadResult =
  | { kind: "found"; config: PrerequisiteConfig; configPath: string; scriptsRoot: vscode.Uri; workspaceRoot: vscode.Uri }
  | { kind: "absent" };

/** One executed phase, plus the interpretation layered on top of the raw result. */
export interface StepExecution {
  step: PrerequisiteStep;
  scriptFileName: string;
  result: ScriptRunResult;
  /** Parsed `::VALIDATED::` marker. Undefined when the script emitted no marker. */
  validated?: boolean;
  /** True when the marker and the exit code disagree. */
  markerConflict: boolean;
}

export type OrchestrationOutcome =
  | "notConfigured"
  | "alreadyValidated"
  | "validated"
  | "validationNotPersisted"
  | "setupDeclined"
  | "setupFailed"
  | "stillInvalid"
  | "declined"
  | "cancelled"
  | "alreadyRunning"
  | "failed";

export interface OrchestrationResult {
  outcome: OrchestrationOutcome;
  furthestStep: PrerequisiteStep | "none";
  durationMs: number;
  correlationId: string;
  steps: StepExecution[];
  error?: PrerequisiteError;
}
