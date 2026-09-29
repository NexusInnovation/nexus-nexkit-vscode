import * as fs from "fs";
import * as path from "path";
import type * as vscode from "vscode";
import {
  SquadError,
  SquadResult,
  SquadWorktreeDependencyMode,
  SquadWorktreeDependencyOutcome,
  SquadWorktreeDependencyState,
  SquadWorktreeWarning,
  squadOk,
} from "../models";
import { ChildProcessSquadRunner, SquadProcessRunner } from "./squadProcessRunner";

const INSTALL_TIMEOUT_MS = 120000;

export interface WorktreeDependencyStrategyOptions {
  runner?: SquadProcessRunner;
  workspaceTrusted?: () => boolean;
}

export class WorktreeDependencyStrategy {
  private readonly _runner: SquadProcessRunner;
  private readonly _workspaceTrusted: () => boolean;

  constructor(options: WorktreeDependencyStrategyOptions = {}) {
    this._runner = options.runner ?? new ChildProcessSquadRunner();
    this._workspaceTrusted = options.workspaceTrusted ?? (() => true);
  }

  public async setup(options: {
    mainRoot: string;
    worktreePath: string;
    requestedMode: SquadWorktreeDependencyMode;
    token?: vscode.CancellationToken;
  }): Promise<SquadResult<{ outcome: SquadWorktreeDependencyOutcome; warnings: SquadWorktreeWarning[] }>> {
    const packageManager = await detectPackageManager(options.worktreePath);
    const warnings: SquadWorktreeWarning[] = [];
    let mode = options.requestedMode;

    if (mode === SquadWorktreeDependencyMode.Auto) {
      if (!packageManager) {
        return squadOk({
          outcome: { mode, state: SquadWorktreeDependencyState.Skipped, error: null },
          warnings: [{ code: "dependencies-skipped", message: "No lockfile was found, so dependency setup was skipped." }],
        });
      }
      if (!this._workspaceTrusted()) {
        return squadOk({
          outcome: { mode, state: SquadWorktreeDependencyState.Skipped, error: null },
          warnings: [
            {
              code: "dependencies-untrusted",
              message: "Dependency install was skipped because the workspace is not trusted.",
              remediation: "Trust the workspace, then retry dependency setup.",
            },
          ],
        });
      }
      mode = SquadWorktreeDependencyMode.Install;
    }

    if (mode === SquadWorktreeDependencyMode.None) {
      return squadOk({
        outcome: { mode, state: SquadWorktreeDependencyState.Skipped, error: null },
        warnings: [{ code: "dependencies-skipped", message: "Dependency setup was skipped by configuration." }],
      });
    }

    if (mode === SquadWorktreeDependencyMode.Link) {
      if (packageManager === "pnpm") {
        warnings.push({
          code: "pnpm-link-refused",
          message: "NexKit does not junction pnpm node_modules because pnpm hooks can purge through the link.",
          remediation: "A real pnpm install will be run in the worktree instead.",
        });
        mode = SquadWorktreeDependencyMode.Install;
      } else {
        const linkResult = await this._linkNodeModules(options.mainRoot, options.worktreePath);
        return squadOk({ outcome: linkResult, warnings });
      }
    }

    if (mode === SquadWorktreeDependencyMode.Install) {
      if (!packageManager) {
        return squadOk({
          outcome: { mode, state: SquadWorktreeDependencyState.Skipped, error: null },
          warnings: [{ code: "dependencies-skipped", message: "No supported lockfile was found, so install was skipped." }],
        });
      }
      if (!this._workspaceTrusted()) {
        return squadOk({
          outcome: { mode, state: SquadWorktreeDependencyState.Skipped, error: null },
          warnings: [
            {
              code: "dependencies-untrusted",
              message: "Dependency install was skipped because the workspace is not trusted.",
              remediation: "Trust the workspace, then retry dependency setup.",
            },
          ],
        });
      }
      return squadOk({ outcome: await this._install(options.worktreePath, packageManager, options.token, mode), warnings });
    }

    return squadOk({
      outcome: { mode, state: SquadWorktreeDependencyState.Skipped, error: null },
      warnings,
    });
  }

  private async _install(
    worktreePath: string,
    packageManager: PackageManager,
    token: vscode.CancellationToken | undefined,
    mode: SquadWorktreeDependencyMode
  ): Promise<SquadWorktreeDependencyOutcome> {
    const command = packageManager;
    const args =
      packageManager === "pnpm"
        ? ["install", "--frozen-lockfile", "--prefer-offline"]
        : packageManager === "npm"
          ? ["ci"]
          : ["install", "--immutable"];
    const result = await this._runner.run({ command, args, cwd: worktreePath, timeoutMs: INSTALL_TIMEOUT_MS, token });
    if (result.exitCode === 0 && !result.cancelled && !result.timedOut && !result.spawnErrorCode) {
      return { mode, state: SquadWorktreeDependencyState.Installed, error: null };
    }
    return {
      mode,
      state: SquadWorktreeDependencyState.Failed,
      error: dependencyError(result.spawnErrorCode ?? (result.timedOut ? "timeout" : result.cancelled ? "cancelled" : `exit ${result.exitCode}`)),
    };
  }

  private async _linkNodeModules(mainRoot: string, worktreePath: string): Promise<SquadWorktreeDependencyOutcome> {
    const source = path.join(mainRoot, "node_modules");
    const target = path.join(worktreePath, "node_modules");
    try {
      const sourceStat = await fs.promises.stat(source);
      await fs.promises.symlink(source, target, process.platform === "win32" && sourceStat.isDirectory() ? "junction" : "dir");
      return { mode: SquadWorktreeDependencyMode.Link, state: SquadWorktreeDependencyState.Linked, error: null };
    } catch (error) {
      return {
        mode: SquadWorktreeDependencyMode.Link,
        state: SquadWorktreeDependencyState.Failed,
        error: dependencyError(error instanceof Error ? error.message : String(error)),
      };
    }
  }
}

type PackageManager = "pnpm" | "npm" | "yarn";

async function detectPackageManager(root: string): Promise<PackageManager | null> {
  if (await exists(path.join(root, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (await exists(path.join(root, "package-lock.json"))) {
    return "npm";
  }
  if (await exists(path.join(root, "yarn.lock"))) {
    return "yarn";
  }
  return null;
}

async function exists(fsPath: string): Promise<boolean> {
  try {
    await fs.promises.access(fsPath);
    return true;
  } catch {
    return false;
  }
}

function dependencyError(detail: string): SquadError {
  return {
    code: "dependency-setup-failed",
    message: "Dependency setup failed in the Squad worktree.",
    remediation: "Open the worktree and run the package manager install command manually, or retry from NexKit.",
    detail,
  };
}

