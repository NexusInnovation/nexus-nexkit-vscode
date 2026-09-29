import * as path from "path";
import type * as vscode from "vscode";
import { SquadError, SquadResult, squadErr, squadOk } from "../models";
import { ChildProcessSquadRunner, SquadProcessRunner, SquadSpawnResult } from "./squadProcessRunner";

const DEFAULT_GIT_TIMEOUT_MS = 15000;

export interface GitWorktreeEntry {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
  isMain: boolean;
}

export interface GitBranchRef {
  name: string;
  remote: boolean;
  checkedOutPath: string | null;
}

export interface GitAheadBehind {
  ahead: number;
  behind: number;
}

export interface GitWorktreeClientOptions {
  runner?: SquadProcessRunner;
  gitCommand?: string;
  timeoutMs?: number;
}

export class GitWorktreeClient {
  private readonly _runner: SquadProcessRunner;
  private readonly _gitCommand: string;
  private readonly _timeoutMs: number;

  constructor(options: GitWorktreeClientOptions = {}) {
    this._runner = options.runner ?? new ChildProcessSquadRunner();
    this._gitCommand = options.gitCommand ?? "git";
    this._timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
  }

  public async commonDir(root: string, token?: vscode.CancellationToken): Promise<SquadResult<string>> {
    const result = await this._git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"], token);
    if (!result.ok) {
      return result;
    }
    return squadOk(result.value.stdout.trim());
  }

  public async listWorktrees(root: string, token?: vscode.CancellationToken): Promise<SquadResult<GitWorktreeEntry[]>> {
    const result = await this._git(root, ["worktree", "list", "--porcelain", "-z"], token);
    if (!result.ok) {
      return result;
    }
    return squadOk(parseWorktreePorcelain(result.value.stdout));
  }

  public async status(worktreePath: string, token?: vscode.CancellationToken): Promise<SquadResult<boolean>> {
    const result = await this._git(worktreePath, ["status", "--porcelain=v1", "-z"], token);
    if (!result.ok) {
      return result;
    }
    return squadOk(result.value.stdout.length > 0);
  }

  public async aheadBehind(root: string, branch: string, base: string, token?: vscode.CancellationToken): Promise<SquadResult<GitAheadBehind>> {
    const result = await this._git(root, ["rev-list", "--left-right", "--count", `${base}...${branch}`], token);
    if (!result.ok) {
      return result;
    }
    const [behindRaw, aheadRaw] = result.value.stdout.trim().split(/\s+/);
    return squadOk({ ahead: Number(aheadRaw) || 0, behind: Number(behindRaw) || 0 });
  }

  public async findBranchesByPrefix(root: string, prefix: string, token?: vscode.CancellationToken): Promise<SquadResult<GitBranchRef[]>> {
    const result = await this._git(
      root,
      ["for-each-ref", "--format=%(refname:short)%00%(worktreepath)", "refs/heads", "refs/remotes"],
      token
    );
    if (!result.ok) {
      return result;
    }
    return squadOk(parseBranchRefs(result.value.stdout, prefix));
  }

  public async resolveDefaultBranch(root: string, token?: vscode.CancellationToken): Promise<SquadResult<string>> {
    const originHead = await this._git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], token);
    if (originHead.ok && originHead.value.stdout.trim()) {
      return squadOk(originHead.value.stdout.trim().replace(/^origin\//, ""));
    }

    const remoteHead = await this._git(root, ["ls-remote", "--symref", "origin", "HEAD"], token, 10000);
    if (remoteHead.ok) {
      const match = /^ref:\s+refs\/heads\/([^\s]+)\s+HEAD/m.exec(remoteHead.value.stdout);
      if (match) {
        return squadOk(match[1]);
      }
    }

    for (const candidate of ["develop", "main", "master"]) {
      const exists = await this._git(root, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${candidate}`], token);
      if (exists.ok) {
        return squadOk(candidate);
      }
    }

    return squadErr({
      code: "worktree-base-not-found",
      message: "NexKit could not resolve a base branch for the Squad worktree.",
      remediation: "Choose a base branch explicitly, fetch the repository, then try again.",
    });
  }

  public async fetch(root: string, remote: string, ref: string, token?: vscode.CancellationToken): Promise<SquadResult<void>> {
    const result = await this._git(root, ["fetch", remote, ref], token, 30000);
    return result.ok ? squadOk(undefined) : result;
  }

  public async checkRefFormat(root: string, branch: string, token?: vscode.CancellationToken): Promise<SquadResult<void>> {
    const result = await this._git(root, ["check-ref-format", "--branch", branch], token);
    return result.ok ? squadOk(undefined) : result;
  }

  public async addWorktree(
    root: string,
    options: { path: string; branch: string; startPoint?: string; newBranch: boolean; track: boolean },
    token?: vscode.CancellationToken
  ): Promise<SquadResult<void>> {
    const args = ["worktree", "add"];
    if (options.newBranch) {
      args.push(options.track ? "--track" : "--no-track", "-b", options.branch);
    }
    args.push(options.path);
    if (options.newBranch && options.startPoint) {
      args.push(options.startPoint);
    } else if (!options.newBranch) {
      args.push(options.branch);
    }
    const result = await this._git(root, args, token, 30000);
    return result.ok ? squadOk(undefined) : result;
  }

  public async removeWorktree(root: string, worktreePath: string, force: boolean, longPaths: boolean, token?: vscode.CancellationToken): Promise<SquadResult<void>> {
    const prefix = longPaths ? ["-c", "core.longpaths=true"] : [];
    const result = await this._git(root, [...prefix, "worktree", "remove", ...(force ? ["--force"] : []), worktreePath], token, 30000);
    return result.ok ? squadOk(undefined) : result;
  }

  public async prune(root: string, token?: vscode.CancellationToken): Promise<SquadResult<void>> {
    const result = await this._git(root, ["worktree", "prune"], token);
    return result.ok ? squadOk(undefined) : result;
  }

  public async deleteBranch(root: string, branch: string, force: boolean, token?: vscode.CancellationToken): Promise<SquadResult<void>> {
    const result = await this._git(root, ["branch", force ? "-D" : "-d", branch], token);
    return result.ok ? squadOk(undefined) : result;
  }

  public async getConfig(root: string, key: string, token?: vscode.CancellationToken): Promise<SquadResult<string | null>> {
    const result = await this._git(root, ["config", "--local", "--get", key], token);
    if (!result.ok) {
      if (result.error.detail === "exit code 1") {
        return squadOk(null);
      }
      return result;
    }
    return squadOk(result.value.stdout.trim() || null);
  }

  public async setConfig(root: string, key: string, value: string, token?: vscode.CancellationToken): Promise<SquadResult<void>> {
    const result = await this._git(root, ["config", "--local", key, value], token);
    return result.ok ? squadOk(undefined) : result;
  }

  public async stashAll(worktreePath: string, message: string, token?: vscode.CancellationToken): Promise<SquadResult<void>> {
    const result = await this._git(worktreePath, ["stash", "push", "--include-untracked", "-m", message], token, 30000);
    return result.ok ? squadOk(undefined) : result;
  }

  public async lsTreeMaxPathLength(root: string, ref: string, token?: vscode.CancellationToken): Promise<SquadResult<number>> {
    const result = await this._git(root, ["ls-tree", "-r", "--name-only", ref], token);
    if (!result.ok) {
      return result;
    }
    const max = result.value.stdout.split(/\r?\n/).reduce((longest, entry) => Math.max(longest, entry.length), 0);
    return squadOk(max);
  }

  private async _git(
    cwd: string,
    args: string[],
    token?: vscode.CancellationToken,
    timeoutMs = this._timeoutMs
  ): Promise<SquadResult<SquadSpawnResult>> {
    const result = await this._runner.run({ command: this._gitCommand, args: ["-C", cwd, ...args], cwd, timeoutMs, token });
    const failure = mapGitFailure(result);
    return failure ? squadErr(failure) : squadOk(result);
  }
}

export function parseWorktreePorcelain(stdout: string): GitWorktreeEntry[] {
  const records = stdout.split("\0").filter(Boolean);
  const entries: GitWorktreeEntry[] = [];
  let current: Partial<GitWorktreeEntry> | null = null;
  for (const record of records) {
    const [key, ...rest] = record.split(" ");
    const value = rest.join(" ");
    if (key === "worktree") {
      if (current?.path) {
        entries.push(finalizeWorktree(current, entries.length === 0));
      }
      current = { path: value, head: "", branch: null, bare: false, detached: false, locked: false, prunable: false };
    } else if (current) {
      if (key === "HEAD") {
        current.head = value;
      } else if (key === "branch") {
        current.branch = value.replace(/^refs\/heads\//, "");
      } else if (key === "bare") {
        current.bare = true;
      } else if (key === "detached") {
        current.detached = true;
      } else if (key === "locked") {
        current.locked = true;
      } else if (key === "prunable") {
        current.prunable = true;
      }
    }
  }
  if (current?.path) {
    entries.push(finalizeWorktree(current, entries.length === 0));
  }
  return entries;
}

export function parseBranchRefs(stdout: string, prefix: string): GitBranchRef[] {
  const refs: GitBranchRef[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const [name, checkedOutPath = ""] = line.split("\0");
    const shortName = name.replace(/^origin\//, "");
    if (shortName.startsWith(prefix)) {
      refs.push({ name, remote: name.includes("/"), checkedOutPath: checkedOutPath || null });
    }
  }
  return refs;
}

export function mapGitFailure(result: SquadSpawnResult): SquadError | null {
  if (result.spawnErrorCode) {
    return result.spawnErrorCode === "ENOENT"
      ? { code: "git-not-found", message: "Git is not installed or not on PATH.", remediation: "Install Git, then try again." }
      : { code: "worktree-create-failed", message: "Git could not be started.", detail: result.spawnErrorCode };
  }
  if (result.cancelled) {
    return { code: "cancelled", message: "The git operation was cancelled." };
  }
  if (result.timedOut) {
    return { code: "worktree-create-failed", message: "The git operation timed out.", remediation: "Retry the operation." };
  }
  if (result.exitCode === 0) {
    return null;
  }

  const output = `${result.stderr}\n${result.stdout}`;
  const detail = excerpt(result.stderr || result.stdout) ?? `exit code ${result.exitCode}`;
  if (/not a git repository/i.test(output)) {
    return { code: "not-a-git-repository", message: "The selected workspace is not a git repository.", remediation: "Open a git repository folder.", detail };
  }
  if (/already exists/i.test(output)) {
    return { code: "worktree-path-exists", message: "The target worktree path already exists.", remediation: "Remove the folder or choose a different worktree parent.", detail };
  }
  if (/already checked out|already used by worktree/i.test(output)) {
    return { code: "worktree-branch-checked-out", message: "That Squad branch is already checked out in another worktree.", remediation: "Open the existing worktree instead.", detail };
  }
  if (/\.lock.*File exists|File exists.*\.lock|config\.lock/i.test(output)) {
    return { code: "worktree-locked", message: "Git is locked by another process.", remediation: "Wait for the other git process to finish, then retry.", detail };
  }
  if (/filename too long|enametoolong/i.test(output)) {
    return { code: "worktree-path-too-long", message: "The worktree path is too long for Git.", remediation: "Use a shorter worktree parent or enable Git long paths.", detail };
  }
  return { code: "worktree-create-failed", message: "Git failed to complete the worktree operation.", remediation: "Check the Nexkit output channel for details, then retry.", detail };
}

function finalizeWorktree(entry: Partial<GitWorktreeEntry>, isMain: boolean): GitWorktreeEntry {
  return {
    path: path.resolve(entry.path ?? ""),
    head: entry.head ?? "",
    branch: entry.branch ?? null,
    bare: entry.bare ?? false,
    detached: entry.detached ?? false,
    locked: entry.locked ?? false,
    prunable: entry.prunable ?? false,
    isMain,
  };
}

function excerpt(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}...` : trimmed;
}

