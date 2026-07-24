import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { SettingsManager } from "../../../core/settingsManager";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  RepositorySyncOutcome,
  RepositorySyncPullResult,
  RepositorySyncRepository,
} from "../models/repositorySyncModels";

export class RepositoryPullService {
  private readonly _logging: LoggingService;

  public constructor(logging: LoggingService) {
    this._logging = logging;
  }

  public async pullRepository(repository: RepositorySyncRepository): Promise<RepositorySyncPullResult> {
    const precheck = await this._runPrecheck(repository);
    if (precheck.kind !== "success-ready") {
      return this._toPullResult(repository, precheck, false);
    }

    const fetchResult = await this._runGitCommand(repository.path, ["fetch", "--prune", "--quiet"]);
    if (!fetchResult.success) {
      return this._toPullResult(
        repository,
        {
          kind: "failed",
          reason: "Remote fetch failed.",
          suggestedAction: "Check connectivity and remote credentials.",
        },
        false
      );
    }

    const divergenceResult = await this._runGitCommand(repository.path, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{u}",
    ]);
    if (!divergenceResult.success) {
      return this._toPullResult(
        repository,
        {
          kind: "failed",
          reason: "Unable to determine divergence after fetch.",
        },
        false
      );
    }

    const parsed = this._parseAheadBehind(divergenceResult.stdout.trim());
    if (!parsed) {
      return this._toPullResult(
        repository,
        {
          kind: "failed",
          reason: "Unexpected git divergence output.",
        },
        false
      );
    }

    const { behind, ahead } = parsed;
    if (ahead > 0 && behind > 0) {
      return this._toPullResult(
        repository,
        {
          kind: "conflict-risk",
          reason: "Local and remote branches diverged.",
          suggestedAction: "Reconcile branch manually before syncing.",
        },
        false
      );
    }

    if (ahead > 0) {
      return this._toPullResult(
        repository,
        {
          kind: "conflict-risk",
          reason: "Local branch is ahead of upstream.",
          suggestedAction: "Push or rebase manually before automated sync.",
        },
        false
      );
    }

    if (behind === 0) {
      return this._toPullResult(
        repository,
        {
          kind: "skipped",
          reason: "Repository already up to date.",
        },
        false
      );
    }

    return this._toPullResult(
      repository,
      {
        kind: "success-ready",
        reason: `Fast-forward available (${behind} commit(s) behind).`,
      },
      true
    );
  }

  private async _runPrecheck(repository: RepositorySyncRepository): Promise<RepositorySyncOutcome> {
    const repositoryPath = repository.path;
    if (!repositoryPath || repositoryPath.trim().length === 0) {
      return { kind: "failed", reason: "Repository path is empty." };
    }

    if (!fs.existsSync(repositoryPath) || !fs.statSync(repositoryPath).isDirectory()) {
      return { kind: "failed", reason: "Repository path does not exist." };
    }

    if (!(await this._isGitRepository(repositoryPath))) {
      return {
        kind: "skipped",
        reason: "Path is not a git repository.",
      };
    }

    const dirtyResult = await this._runGitCommand(repositoryPath, ["status", "--porcelain"]);
    if (!dirtyResult.success) {
      return { kind: "failed", reason: "Unable to read repository status." };
    }

    if (dirtyResult.stdout.trim().length > 0) {
      return {
        kind: "conflict-risk",
        reason: "Working tree has uncommitted changes.",
        suggestedAction: "Commit or stash changes before syncing.",
      };
    }

    const branchResult = await this._runGitCommand(repositoryPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branchResult.success) {
      return { kind: "failed", reason: "Unable to resolve current branch." };
    }

    const branch = branchResult.stdout.trim();
    const allowedBranches = SettingsManager.getRepoSyncAllowedBranches();
    if (allowedBranches.length > 0 && !allowedBranches.includes(branch)) {
      return {
        kind: "skipped",
        reason: `Branch '${branch}' is not in the allowed branch list.`,
      };
    }

    const upstreamResult = await this._runGitCommand(repositoryPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    if (!upstreamResult.success || upstreamResult.stdout.trim().length === 0) {
      return {
        kind: "skipped",
        reason: "No upstream tracking branch configured.",
      };
    }

    const remoteCheck = await this._runGitCommand(repositoryPath, ["ls-remote", "--heads", "origin"]);
    if (!remoteCheck.success) {
      return {
        kind: "failed",
        reason: "Remote origin is not reachable.",
        suggestedAction: "Verify network access and git credentials.",
      };
    }

    return {
      kind: "success-ready",
      branch,
    };
  }

  private async _isGitRepository(repositoryPath: string): Promise<boolean> {
    const directGitDirectory = path.join(repositoryPath, ".git");
    if (fs.existsSync(directGitDirectory)) {
      return true;
    }

    const result = await this._runGitCommand(repositoryPath, ["rev-parse", "--git-dir"]);
    return result.success;
  }

  private _parseAheadBehind(stdout: string): { ahead: number; behind: number } | undefined {
    const parts = stdout.split(/\s+/).map((value) => Number(value));
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return undefined;
    }

    return {
      ahead: parts[0],
      behind: parts[1],
    };
  }

  private _toPullResult(
    repository: RepositorySyncRepository,
    outcome: RepositorySyncOutcome,
    changed: boolean
  ): RepositorySyncPullResult {
    const success = outcome.kind === "success-ready";
    const skipped = outcome.kind === "skipped";

    this._logging.info("Repository sync precheck completed", {
      repository: repository.name,
      path: repository.path,
      outcome: outcome.kind,
      reason: outcome.reason,
    });

    return {
      repository,
      outcome,
      success,
      changed,
      skipped,
      reason: outcome.reason,
    };
  }

  private async _runGitCommand(
    cwd: string,
    args: string[]
  ): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve) => {
      const child = spawn("git", args, {
        cwd,
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error: Error) => {
        this._logging.warn("Repository sync git command failed to launch", {
          cwd,
          args,
          error: error.message,
        });
        resolve({ success: false, stdout, stderr: error.message, exitCode: null });
      });

      child.on("close", (exitCode) => {
        resolve({ success: exitCode === 0, stdout, stderr, exitCode });
      });
    });
  }
}
