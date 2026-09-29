/**
 * Long-running process seam for the Squad CLI (SQD-045, `squad watch`).
 *
 * Unlike {@link import("./squadProcessRunner").SquadProcessRunner}, which runs a
 * bounded command to completion with a timeout, a long-running process streams
 * output until it is explicitly stopped. The launcher is injectable so
 * `SquadWatchService` is unit-testable with a simulated child process.
 *
 * Security invariants match the bounded runner: `shell: false`, an explicit
 * args array, and the same cross-platform launch resolution
 * ({@link resolveSquadLaunch}).
 */

import { spawn, type ChildProcess } from "child_process";
import { resolveSquadLaunch } from "./squadProcessRunner";

/** A long-running Squad CLI process request (already allow-list validated). */
export interface SquadLongRunningSpawnRequest {
  /** Executable to run (e.g. `npx`, `squad`, or a custom absolute path). */
  command: string;

  /** Fully-resolved, validated argument vector. */
  args: string[];

  /** Working directory for the process. */
  cwd?: string;
}

/**
 * Callbacks for a long-running process. Exactly one terminal callback is
 * expected per process (`onError` when it cannot be spawned, otherwise
 * `onExit`), but consumers must tolerate both firing.
 */
export interface SquadLongRunningListeners {
  /** The OS process was created successfully. */
  onSpawn(): void;

  /** A chunk of standard output (UTF-8). */
  onStdout(chunk: string): void;

  /** A chunk of standard error (UTF-8). */
  onStderr(chunk: string): void;

  /** The process could not be spawned or errored (e.g. `ENOENT`). */
  onError(errorCode: string): void;

  /** The process exited and its stdio streams closed. */
  onExit(exitCode: number | null, signal: string | null): void;
}

/** Handle used to terminate a running long-running process. */
export interface SquadLongRunningHandle {
  /**
   * Request termination. `force: false` asks the process to stop gracefully
   * (SIGTERM); `force: true` kills it (SIGKILL). On Windows the whole process
   * tree is always terminated (`taskkill /T /F`) because the CLI runs behind a
   * `cmd.exe` shim that would otherwise orphan the real process.
   */
  kill(force: boolean): void;
}

/** Injectable launcher for long-running Squad CLI processes. */
export interface SquadLongRunningLauncher {
  launch(request: SquadLongRunningSpawnRequest, listeners: SquadLongRunningListeners): SquadLongRunningHandle;
}

/** Default {@link SquadLongRunningLauncher} backed by `child_process.spawn`. */
export class ChildProcessSquadLongRunningLauncher implements SquadLongRunningLauncher {
  public launch(request: SquadLongRunningSpawnRequest, listeners: SquadLongRunningListeners): SquadLongRunningHandle {
    const launch = resolveSquadLaunch(request.command, request.args, {
      platform: process.platform,
      comSpec: process.env.ComSpec,
    });

    let child: ChildProcess;
    try {
      child = spawn(launch.command, launch.args, {
        cwd: request.cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code ?? "SPAWN_ERROR";
      queueMicrotask(() => listeners.onError(code));
      return { kill: (): void => undefined };
    }

    child.once("spawn", () => listeners.onSpawn());
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => listeners.onStdout(chunk));
    child.stderr?.on("data", (chunk: string) => listeners.onStderr(chunk));
    child.once("error", (error: NodeJS.ErrnoException) => listeners.onError(error.code ?? "SPAWN_ERROR"));
    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => listeners.onExit(code, signal));

    return {
      kill: (force: boolean): void => this._kill(child, force),
    };
  }

  private _kill(child: ChildProcess, force: boolean): void {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    if (process.platform === "win32" && child.pid !== undefined) {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", () => {
        try {
          child.kill();
        } catch {
          // Already gone.
        }
      });
      return;
    }

    try {
      child.kill(force ? "SIGKILL" : "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}
