import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type * as vscode from "vscode";
import {
  SquadResult,
  SquadWorktreeRemovalFallback,
  squadErr,
  squadOk,
} from "../models";
import { GitWorktreeClient } from "./gitWorktreeClient";
import { ChildProcessSquadRunner, SquadProcessRunner } from "./squadProcessRunner";

export interface WorktreeRemoverOptions {
  git: GitWorktreeClient;
  runner?: SquadProcessRunner;
  platform?: NodeJS.Platform;
}

export interface WorktreeRemoveOutcome {
  removed: boolean;
  fallback: SquadWorktreeRemovalFallback;
}

export class WorktreeRemover {
  private readonly _git: GitWorktreeClient;
  private readonly _runner: SquadProcessRunner;
  private readonly _platform: NodeJS.Platform;

  constructor(options: WorktreeRemoverOptions) {
    this._git = options.git;
    this._runner = options.runner ?? new ChildProcessSquadRunner();
    this._platform = options.platform ?? process.platform;
  }

  public async remove(
    root: string,
    worktreePath: string,
    options: { force: boolean; token?: vscode.CancellationToken }
  ): Promise<SquadResult<WorktreeRemoveOutcome>> {
    await unlinkDependencyLinks(worktreePath);

    const normal = await this._git.removeWorktree(root, worktreePath, options.force, false, options.token);
    if (normal.ok) {
      return squadOk({ removed: true, fallback: SquadWorktreeRemovalFallback.None });
    }
    if (normal.error.code !== "worktree-path-too-long") {
      return squadErr(normal.error);
    }

    const longPaths = await this._git.removeWorktree(root, worktreePath, options.force, true, options.token);
    if (longPaths.ok) {
      return squadOk({ removed: true, fallback: SquadWorktreeRemovalFallback.LongPaths });
    }

    try {
      await fs.promises.rm(worktreePath, { recursive: true, force: true, maxRetries: 3 });
      await this._git.prune(root, options.token);
      return squadOk({ removed: true, fallback: SquadWorktreeRemovalFallback.FsRm });
    } catch {
      if (this._platform !== "win32") {
        return removeFailed();
      }
    }

    const robocopy = await this._robocopyEmpty(worktreePath, options.token);
    if (!robocopy.ok) {
      return robocopy;
    }
    await this._git.prune(root, options.token);
    return squadOk({ removed: true, fallback: SquadWorktreeRemovalFallback.Robocopy });
  }

  private async _robocopyEmpty(worktreePath: string, token?: vscode.CancellationToken): Promise<SquadResult<WorktreeRemoveOutcome>> {
    const emptyDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nexkit-empty-"));
    try {
      const result = await this._runner.run({
        command: "robocopy.exe",
        args: [emptyDir, worktreePath, "/MIR", "/XJ", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS"],
        cwd: emptyDir,
        timeoutMs: 120000,
        token,
      });
      if (result.spawnErrorCode || result.timedOut || result.cancelled || (result.exitCode !== null && result.exitCode >= 8)) {
        return removeFailed();
      }
      await fs.promises.rm(worktreePath, { recursive: true, force: true, maxRetries: 3 });
      return squadOk({ removed: true, fallback: SquadWorktreeRemovalFallback.Robocopy });
    } finally {
      await fs.promises.rm(emptyDir, { recursive: true, force: true });
    }
  }
}

export async function unlinkDependencyLinks(worktreePath: string): Promise<void> {
  for (const name of ["node_modules"]) {
    const target = path.join(worktreePath, name);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.lstat(target);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      await fs.promises.rm(target, { force: true });
    }
  }
}

function removeFailed(): SquadResult<WorktreeRemoveOutcome> {
  return squadErr({
    code: "worktree-remove-failed",
    message: "NexKit could not remove the Squad worktree after all safe fallback attempts.",
    remediation: "Unlink node_modules, remove the folder manually, then run `git worktree prune` from the main repository.",
  });
}

