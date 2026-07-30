import { ChildProcess, spawn } from "child_process";
import * as vscode from "vscode";
import { OutputBuffer } from "./outputBuffer";
import { IClock, IProcessRunner, ITimers, ProcessRunOptions, ScriptRunResult, systemClock, systemTimers } from "./types";

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

/**
 * The only component in this feature permitted to import `child_process`.
 *
 * Deliberately free of domain logic: it spawns, captures, enforces the timeout
 * and cancellation kill sequence, and reports a raw {@link ScriptRunResult}.
 * All interpretation lives in `PrerequisiteRunnerService`.
 *
 * Cancellation and timeout are first-class outcomes (`"cancelled"` /
 * `"timedOut"`), never a `"completed"` result carrying a magic failure string.
 *
 * Kills target the whole process tree, because the interesting descendants are
 * the package managers: killing `pwsh` or `bash` alone leaves `winget`, `brew`,
 * or `apt` running. On POSIX the child is spawned as a process-group leader and
 * the group is signalled; on Windows `taskkill /T /F` walks the tree. Whenever
 * that escalation cannot be applied the result is flagged with
 * `descendantsMaySurvive` so the caller can tell the user the truth instead of
 * implying a clean stop.
 */
export class NodeProcessRunner implements IProcessRunner {
  public constructor(
    private readonly _clock: IClock = systemClock,
    private readonly _timers: ITimers = systemTimers,
    private readonly _platform: NodeJS.Platform = process.platform
  ) {}

  public run(command: string, args: string[], options: ProcessRunOptions): Promise<ScriptRunResult> {
    return new Promise<ScriptRunResult>((resolve) => {
      const startedAt = this._clock.now();
      const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
      const stdout = new OutputBuffer(maxBytes);
      const stderr = new OutputBuffer(maxBytes);

      let settled = false;
      let timedOut = false;
      let cancelled = false;
      let descendantsMaySurvive = false;
      let softTimer: NodeJS.Timeout | undefined;
      let hardTimer: NodeJS.Timeout | undefined;
      let cancellationSubscription: vscode.Disposable | undefined;

      const cleanup = (): void => {
        this._timers.clearTimeout(softTimer);
        this._timers.clearTimeout(hardTimer);
        cancellationSubscription?.dispose();
      };

      const settle = (result: Omit<ScriptRunResult, "durationMs" | "stdout" | "stderr" | "truncated">): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve({
          ...result,
          descendantsMaySurvive: descendantsMaySurvive || undefined,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          truncated: stdout.truncated || stderr.truncated,
          durationMs: this._clock.now() - startedAt,
        });
      };

      const isPosix = this._platform !== "win32";

      let child: ChildProcess;
      try {
        child = spawn(command, args, {
          cwd: options.cwd,
          env: options.env ?? process.env,
          shell: false,
          windowsHide: true,
          // POSIX only: makes the child a process-group leader so the whole tree
          // can be signalled with a negative PID. Windows has no equivalent, and
          // `detached` there would only spawn a visible console window.
          detached: isPosix,
        });
      } catch (error) {
        settle({
          outcome: "spawnFailed",
          exitCode: null,
          failureReason: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const killTree = (signal: NodeJS.Signals): void => {
        const pid = child.pid;
        if (pid === undefined) {
          // The child never started; nothing to escalate to.
          child.kill(signal);
          return;
        }

        if (isPosix) {
          try {
            // Negative PID = "the whole process group", which only works because
            // the child was spawned detached above.
            process.kill(-pid, signal);
            return;
          } catch {
            // ESRCH (group already gone) or EPERM. Fall back to the direct child
            // and admit that descendants may have been missed.
            descendantsMaySurvive = true;
            child.kill(signal);
            return;
          }
        }

        // Windows: only the SIGKILL-equivalent hard phase has a tree walker.
        // SIGTERM is not deliverable on Windows anyway — `child.kill("SIGTERM")`
        // is already an immediate TerminateProcess — so the grace period is spent
        // waiting rather than terminating, and the tree kill happens on escalation.
        if (signal !== "SIGKILL") {
          return;
        }

        try {
          const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
            shell: false,
            windowsHide: true,
          });
          taskkill.on("error", () => {
            descendantsMaySurvive = true;
            child.kill("SIGKILL");
          });
        } catch {
          descendantsMaySurvive = true;
          child.kill("SIGKILL");
        }
      };

      const killSequence = (): void => {
        killTree("SIGTERM");
        hardTimer = this._timers.setTimeout(() => {
          killTree("SIGKILL");
        }, options.killGraceMs);
      };

      if (options.timeoutMs > 0) {
        softTimer = this._timers.setTimeout(() => {
          timedOut = true;
          killSequence();
        }, options.timeoutMs);
      }

      if (options.cancellationToken) {
        if (options.cancellationToken.isCancellationRequested) {
          cancelled = true;
          killSequence();
        } else {
          cancellationSubscription = options.cancellationToken.onCancellationRequested(() => {
            cancelled = true;
            killSequence();
          });
        }
      }

      // Decode on the stream, not per chunk: a multi-byte character split across
      // a chunk boundary would otherwise be turned into replacement characters.
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => stdout.append(chunk));
      child.stderr?.on("data", (chunk: string) => stderr.append(chunk));

      child.on("error", (error: NodeJS.ErrnoException) => {
        settle({
          outcome: "spawnFailed",
          exitCode: null,
          failureReason: error.code ? `${error.code}: ${error.message}` : error.message,
        });
      });

      child.on("close", (code) => {
        if (timedOut) {
          settle({ outcome: "timedOut", exitCode: code });
          return;
        }
        if (cancelled) {
          settle({ outcome: "cancelled", exitCode: code });
          return;
        }
        settle({ outcome: "completed", exitCode: code });
      });
    });
  }
}
