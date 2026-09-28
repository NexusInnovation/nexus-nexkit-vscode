/**
 * Process-spawning seam for the Squad CLI wrapper (SQD-005).
 *
 * This module defines the injectable {@link SquadProcessRunner} interface and a
 * default {@link ChildProcessSquadRunner} implementation backed by
 * `child_process.spawn`.
 *
 * Security invariants (PRD — "isoler les appels", no shell injection):
 * - Processes are always spawned with `shell: false` and an explicit `args`
 *   array. User-provided operands are never concatenated into a shell string.
 * - On Windows, bare command names (`npx`, `squad`) and `.cmd`/`.bat` shims are
 *   executed through `cmd.exe /c` with the command and each argument passed as
 *   *separate* argv entries. Node applies its cmd-specific escaping to that
 *   array, so no user input is interpolated into a shell command line.
 *
 * The runner reports process-level failures (missing executable, non-zero exit,
 * timeout, cancellation) as structured fields on {@link SquadSpawnResult} and
 * never throws for them, so the service layer can map them to actionable
 * {@link import("./models").SquadError} values.
 */

import { spawn } from "child_process";
import * as path from "path";
import type * as vscode from "vscode";

/** A single Squad CLI process invocation request. */
export interface SquadSpawnRequest {
  /** Executable to run (e.g. `npx`, `squad`, or a custom absolute path). */
  command: string;

  /** Fully-resolved, validated argument vector (no shell metacharacters added). */
  args: string[];

  /** Working directory for the process, when applicable. */
  cwd?: string;

  /** Hard timeout in milliseconds after which the process is killed. */
  timeoutMs: number;

  /** Optional cancellation token; cancelling kills the process. */
  token?: vscode.CancellationToken;
}

/**
 * Outcome of a Squad CLI process invocation.
 *
 * Exactly one terminal condition is reflected: a normal exit exposes
 * {@link exitCode}; `timedOut`, `cancelled` and {@link spawnErrorCode} flag the
 * abnormal terminations. Callers must inspect the flags before trusting
 * {@link exitCode}.
 */
export interface SquadSpawnResult {
  /** Captured standard output. */
  stdout: string;

  /** Captured standard error. */
  stderr: string;

  /** Process exit code, or `null` when it did not exit normally. */
  exitCode: number | null;

  /** Whether the process was killed because it exceeded the timeout. */
  timedOut: boolean;

  /** Whether the process was killed because the caller cancelled. */
  cancelled: boolean;

  /**
   * Error code when the process could not be spawned at all (e.g. `ENOENT`
   * when the executable is missing). Undefined when the process started.
   */
  spawnErrorCode?: string;
}

/**
 * Injectable seam for spawning Squad CLI processes. Abstracted so the service
 * is unit-testable with Sinon fakes without spawning real processes.
 */
export interface SquadProcessRunner {
  run(request: SquadSpawnRequest): Promise<SquadSpawnResult>;
}

/** Grace period between SIGTERM and SIGKILL when force-killing a process. */
const KILL_GRACE_MS = 2000;

/**
 * Default {@link SquadProcessRunner} backed by `child_process.spawn` with
 * `shell: false`. Handles per-command timeouts, cooperative cancellation and
 * cross-platform executable resolution.
 */
export class ChildProcessSquadRunner implements SquadProcessRunner {
  public run(request: SquadSpawnRequest): Promise<SquadSpawnResult> {
    return new Promise<SquadSpawnResult>((resolve) => {
      const { command, args, cwd, timeoutMs, token } = request;

      const useCmdShell = process.platform === "win32" && this._needsCmdShell(command);
      const comSpec = process.env.ComSpec || "cmd.exe";
      const spawnCommand = useCmdShell ? comSpec : command;
      const spawnArgs = useCmdShell ? ["/d", "/s", "/c", command, ...args] : args;

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let cancelled = false;
      let settled = false;

      const child = spawn(spawnCommand, spawnArgs, {
        cwd,
        shell: false,
        windowsHide: true,
        env: process.env,
      });

      const killTree = (): void => {
        try {
          child.kill("SIGTERM");
        } catch {
          // Process may have already exited; ignore.
        }
        const forceTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // Already gone.
          }
        }, KILL_GRACE_MS);
        forceTimer.unref?.();
      };

      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        killTree();
      }, timeoutMs);

      const cancelSub = token?.onCancellationRequested(() => {
        cancelled = true;
        killTree();
      });

      const finalize = (result: SquadSpawnResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutTimer);
        cancelSub?.dispose();
        resolve(result);
      };

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error: NodeJS.ErrnoException) => {
        finalize({
          stdout,
          stderr,
          exitCode: null,
          timedOut,
          cancelled,
          spawnErrorCode: error.code ?? "SPAWN_ERROR",
        });
      });

      child.on("close", (code: number | null) => {
        finalize({ stdout, stderr, exitCode: code, timedOut, cancelled });
      });
    });
  }

  /**
   * Whether a Windows executable must be launched through `cmd.exe`. True for
   * `.cmd`/`.bat` shims and for bare command names (which resolve to `.cmd`
   * shims on Windows). Absolute `.exe` paths are spawned directly.
   */
  private _needsCmdShell(command: string): boolean {
    const lower = command.toLowerCase();
    if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
      return true;
    }
    if (lower.endsWith(".exe")) {
      return false;
    }
    return !path.isAbsolute(command);
  }
}
