import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SettingsManager } from "../../../core/settingsManager";
import { LoggingService } from "../../../shared/services/loggingService";
import { TelemetryService } from "../../../shared/services/telemetryService";
import {
  SquadBacklogItem,
  SquadBacklogItemQuery,
  SquadError,
  SquadResult,
  SquadWorkState,
  SquadWorktreeBranchSource,
  SquadWorktreeCleanupCandidate,
  SquadWorktreeCleanupReason,
  SquadWorktreeCleanupRequest,
  SquadWorktreeCleanupOutcome,
  SquadWorktreeCreateOutcome,
  SquadWorktreeCreatePreview,
  SquadWorktreeCreateRequest,
  SquadWorktreeDependencyOutcome,
  SquadWorktreeDependencyMode,
  SquadWorktreeDependencyState,
  SquadWorktreeInfo,
  SquadWorktreeRemovalFallback,
  SquadWorktreeWarning,
  squadErr,
  squadOk,
} from "../models";
import { GitBranchRef, GitWorktreeClient, GitWorktreeEntry } from "./gitWorktreeClient";
import { SquadBacklogService } from "./squadBacklogService";
import { SquadWorktreeNaming } from "./squadWorktreeNaming";
import { WorktreeDependencyStrategy } from "./worktreeDependencyStrategy";
import { WorktreeRemover } from "./worktreeRemover";

const BASE_MEMORY_KEY = "nexkit.squad.worktree.lastBaseByRepo";
const WINDOWS_MAX_PATH = 259;

export interface SquadWorktreeServiceOptions {
  git: GitWorktreeClient;
  backlog: SquadBacklogService;
  dependencies: WorktreeDependencyStrategy;
  remover: WorktreeRemover;
  workspaceState: vscode.Memento;
  logger?: LoggingService;
  telemetry?: TelemetryService;
  getWorkspaceRoot?: () => vscode.Uri | undefined;
  openFolder?: (uri: vscode.Uri, options: { forceNewWindow: boolean }) => Promise<void>;
  settings?: SquadWorktreeSettingsAccessor;
}

export interface SquadWorktreeSettingsAccessor {
  dependencies(): SquadWorktreeDependencyMode;
  openInNewWindow(): boolean;
  parentDirectory(): string;
  copyUntracked(): string[];
}

export class SquadWorktreeService {
  private readonly _git: GitWorktreeClient;
  private readonly _backlog: SquadBacklogService;
  private readonly _dependencies: WorktreeDependencyStrategy;
  private readonly _remover: WorktreeRemover;
  private readonly _workspaceState: vscode.Memento;
  private readonly _logger: LoggingService;
  private readonly _telemetry: TelemetryService | undefined;
  private readonly _getWorkspaceRoot: () => vscode.Uri | undefined;
  private readonly _openFolder: (uri: vscode.Uri, options: { forceNewWindow: boolean }) => Promise<void>;
  private readonly _settings: SquadWorktreeSettingsAccessor;
  private readonly _mutex = new Map<string, Promise<unknown>>();
  private readonly _pathById = new Map<string, string>();

  constructor(options: SquadWorktreeServiceOptions) {
    this._git = options.git;
    this._backlog = options.backlog;
    this._dependencies = options.dependencies;
    this._remover = options.remover;
    this._workspaceState = options.workspaceState;
    this._logger = options.logger ?? LoggingService.getInstance();
    this._telemetry = options.telemetry;
    this._getWorkspaceRoot = options.getWorkspaceRoot ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri);
    this._openFolder =
      options.openFolder ??
      (async (uri, opts) => {
        await vscode.commands.executeCommand("vscode.openFolder", uri, opts);
      });
    this._settings =
      options.settings ??
      {
        dependencies: () => SettingsManager.getSquadWorktreeDependencies(),
        openInNewWindow: () => SettingsManager.getSquadWorktreeOpenInNewWindow(),
        parentDirectory: () => SettingsManager.getSquadWorktreeParentDirectory(),
        copyUntracked: () => SettingsManager.getSquadWorktreeCopyUntracked(),
      };
  }

  public async listItems(query: SquadBacklogItemQuery, token?: vscode.CancellationToken): Promise<SquadResult<SquadBacklogItem[]>> {
    const root = this._getWorkspaceRoot();
    return this._backlog.listItems(query, root, token);
  }

  public async list(token?: vscode.CancellationToken): Promise<SquadResult<SquadWorktreeInfo[]>> {
    const context = await this._context(token);
    if (!context.ok) {
      return context;
    }
    const worktrees = await this._git.listWorktrees(context.value.mainRoot, token);
    if (!worktrees.ok) {
      return worktrees;
    }
    const infos: SquadWorktreeInfo[] = [];
    for (const entry of worktrees.value) {
      infos.push(await this._toInfo(context.value.mainRoot, entry, token));
    }
    return squadOk(infos);
  }

  public async previewCreate(
    request: SquadWorktreeCreateRequest,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadWorktreeCreatePreview>> {
    const context = await this._context(token);
    if (!context.ok) {
      return context;
    }
    const item = await this._backlog.getItem(request.itemId, context.value.workspaceRoot, token);
    if (!item.ok) {
      return item;
    }
    const base = await this._resolveBase(context.value.mainRoot, request.baseBranch, token);
    if (!base.ok) {
      return base;
    }
    const names = SquadWorktreeNaming.buildNames({
      mainRoot: context.value.mainRoot,
      issueNumber: item.value.number,
      title: item.value.title,
      parentDirectory: this._settings.parentDirectory(),
    });
    const branchSource = await this._branchSource(context.value.mainRoot, item.value.number, names.branch, token);
    if (!branchSource.ok) {
      return branchSource;
    }
    return squadOk({
      providerId: request.providerId,
      itemId: request.itemId,
      issueNumber: item.value.number,
      branch: branchSource.value.branch,
      displayPath: names.worktreePath,
      baseBranch: base.value.baseBranch,
      branchSource: branchSource.value.source,
      warnings: [...base.value.warnings, ...(await this._longPathWarnings(context.value.mainRoot, names.worktreePath, `origin/${base.value.baseBranch}`, token))],
    });
  }

  public async create(
    request: SquadWorktreeCreateRequest,
    progress?: vscode.Progress<{ message?: string }>,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadWorktreeCreateOutcome>> {
    const context = await this._context(token);
    if (!context.ok) {
      return context;
    }
    return this._withRepoLock(context.value.mainRoot, () => this._createLocked(context.value, request, progress, token));
  }

  public async open(worktreeId: string, options: { newWindow?: boolean } = {}): Promise<SquadResult<void>> {
    const pathForId = await this._resolvePathById(worktreeId);
    if (!pathForId.ok) {
      return pathForId;
    }
    await this._openFolder(vscode.Uri.file(pathForId.value), { forceNewWindow: options.newWindow ?? this._settings.openInNewWindow() });
    this._track("squad.worktree.open", { result: "success" });
    return squadOk(undefined);
  }

  public async retryDependencies(
    worktreeId: string,
    mode?: SquadWorktreeDependencyMode,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadWorktreeDependencyOutcome>> {
    const context = await this._context(token);
    if (!context.ok) {
      return context;
    }
    const pathForId = await this._resolvePathById(worktreeId);
    if (!pathForId.ok) {
      return pathForId;
    }
    const dependencyResult = await this._dependencies.setup({
      mainRoot: context.value.mainRoot,
      worktreePath: pathForId.value,
      requestedMode: mode ?? this._settings.dependencies(),
      token,
    });
    if (!dependencyResult.ok) {
      return dependencyResult;
    }
    this._track("squad.worktree.dependencies.retry", {
      result: dependencyResult.value.outcome.state === SquadWorktreeDependencyState.Failed ? "error" : "success",
      depsMode: dependencyResult.value.outcome.mode,
      depsState: dependencyResult.value.outcome.state,
    });
    return squadOk(dependencyResult.value.outcome);
  }

  public async findCleanupCandidates(token?: vscode.CancellationToken): Promise<SquadResult<SquadWorktreeCleanupCandidate[]>> {
    const listed = await this.list(token);
    if (!listed.ok) {
      return listed;
    }
    const root = this._getWorkspaceRoot();
    const candidates: SquadWorktreeCleanupCandidate[] = [];
    for (const worktree of listed.value) {
      if (worktree.isMain || !worktree.branch || worktree.issueNumber === null) {
        continue;
      }
      const reasons: SquadWorktreeCleanupReason[] = [];
      const state = root ? await this._backlog.getWorkState(String(worktree.issueNumber), worktree.branch, root, token) : undefined;
      if (state?.ok) {
        if (state.value.pullRequest === "merged") {
          reasons.push(SquadWorktreeCleanupReason.PullRequestMerged);
        }
        if (state.value.item === "closed") {
          reasons.push(SquadWorktreeCleanupReason.ItemClosed);
        }
      }
      if (worktree.prunable) {
        reasons.push(SquadWorktreeCleanupReason.Prunable);
      }
      const blockers = cleanupBlockers(worktree, state?.ok ? state.value : undefined);
      if (reasons.length > 0 || blockers.length > 0) {
        candidates.push({ worktree, reasons, blockers });
      }
    }
    return squadOk(candidates);
  }

  public async cleanup(
    request: SquadWorktreeCleanupRequest,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadWorktreeCleanupOutcome>> {
    const context = await this._context(token);
    if (!context.ok) {
      return context;
    }
    return this._withRepoLock(context.value.mainRoot, () => this._cleanupLocked(context.value.mainRoot, request, token));
  }

  private async _createLocked(
    context: { workspaceRoot: vscode.Uri; mainRoot: string },
    request: SquadWorktreeCreateRequest,
    progress: vscode.Progress<{ message?: string }> | undefined,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadWorktreeCreateOutcome>> {
    const warnings: SquadWorktreeWarning[] = [];
    progress?.report({ message: "Resolving backlog item..." });
    const item = await this._backlog.getItem(request.itemId, context.workspaceRoot, token);
    if (!item.ok) {
      this._track("squad.worktree.create", { result: "error", errorCode: item.error.code });
      return item;
    }

    const names = SquadWorktreeNaming.buildNames({
      mainRoot: context.mainRoot,
      issueNumber: item.value.number,
      title: item.value.title,
      parentDirectory: this._settings.parentDirectory(),
    });
    const refCheck = await this._git.checkRefFormat(context.mainRoot, names.branch, token);
    if (!refCheck.ok) {
      return refCheck;
    }
    const source = await this._branchSource(context.mainRoot, item.value.number, names.branch, token);
    if (!source.ok) {
      return source;
    }
    const base = await this._resolveBase(context.mainRoot, request.baseBranch, token);
    if (!base.ok) {
      return base;
    }
    warnings.push(...base.value.warnings);

    progress?.report({ message: "Fetching base branch..." });
    let baseFetched = true;
    const fetch = await this._git.fetch(context.mainRoot, "origin", base.value.baseBranch, token);
    if (!fetch.ok) {
      baseFetched = false;
      warnings.push({
        code: "base-fetch-failed",
        message: "NexKit could not fetch the base branch; the local base may be stale.",
        remediation: "Check your network connection and fetch manually if needed.",
      });
    }

    if (await exists(names.worktreePath)) {
      return squadErr({
        code: "worktree-path-exists",
        message: "The target Squad worktree folder already exists.",
        remediation: "Open the existing folder, remove it, or configure a different worktree parent directory.",
      });
    }

    warnings.push(...(await this._longPathWarnings(context.mainRoot, names.worktreePath, `origin/${base.value.baseBranch}`, token)));

    progress?.report({ message: "Creating git worktree..." });
    const add = await this._addWorktree(context.mainRoot, names.worktreePath, source.value.branch, source.value.source, base.value.baseBranch, token);
    if (!add.ok) {
      return add;
    }
    await this._git.setConfig(context.mainRoot, `branch.${source.value.branch}.nexkitBase`, base.value.baseBranch, token);
    await this._rememberBase(context.mainRoot, base.value.baseBranch);

    progress?.report({ message: "Copying NexKit artifacts..." });
    const seededCount = await this._copyUntracked(context.mainRoot, names.worktreePath);

    progress?.report({ message: "Preparing dependencies..." });
    const dependencyResult = await this._dependencies.setup({
      mainRoot: context.mainRoot,
      worktreePath: names.worktreePath,
      requestedMode: request.dependencies ?? this._settings.dependencies(),
      token,
    });
    if (!dependencyResult.ok) {
      return dependencyResult;
    }
    warnings.push(...dependencyResult.value.warnings);

    let opened = false;
    if (request.openInNewWindow ?? this._settings.openInNewWindow()) {
      await this._openFolder(vscode.Uri.file(names.worktreePath), { forceNewWindow: true });
      opened = true;
    }

    const createdEntry: GitWorktreeEntry = {
      path: names.worktreePath,
      head: "",
      branch: source.value.branch,
      bare: false,
      detached: false,
      locked: false,
      prunable: false,
      isMain: false,
    };
    const worktree = await this._toInfo(context.mainRoot, createdEntry, token);
    const outcome: SquadWorktreeCreateOutcome = {
      worktree,
      branch: source.value.branch,
      branchSource: source.value.source,
      baseBranch: base.value.baseBranch,
      baseFetched,
      dependencies: dependencyResult.value.outcome,
      seededCount,
      opened,
      warnings,
    };
    this._track("squad.worktree.create", {
      result: dependencyResult.value.outcome.state === SquadWorktreeDependencyState.Failed ? "partial" : "success",
      providerId: request.providerId,
      branchSource: source.value.source,
      depsMode: dependencyResult.value.outcome.mode,
      depsState: dependencyResult.value.outcome.state,
      baseFetched: String(baseFetched),
    });
    return squadOk(outcome);
  }

  private async _cleanupLocked(
    mainRoot: string,
    request: SquadWorktreeCleanupRequest,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadWorktreeCleanupOutcome>> {
    const worktree = await this._findWorktreeById(mainRoot, request.worktreeId, token);
    if (!worktree.ok) {
      return worktree;
    }
    if (worktree.value.isCurrentWindow) {
      return squadErr({ code: "worktree-in-use", message: "NexKit cannot remove the worktree opened in the current window.", remediation: "Close that window or run cleanup from the main repository." });
    }
    if (worktree.value.locked) {
      return squadErr({ code: "worktree-locked", message: "The selected worktree is locked.", remediation: "Unlock it with git worktree unlock, then retry." });
    }
    let stashed = false;
    if (worktree.value.dirty) {
      if (!request.discardChanges) {
        return squadErr({ code: "worktree-dirty", message: "The selected worktree has uncommitted changes.", remediation: "Commit the changes, or confirm discard so NexKit can stash them before cleanup." });
      }
      const stash = await this._git.stashAll(worktree.value.displayPath, `nexkit-cleanup #${worktree.value.issueNumber ?? "unknown"}`, token);
      if (!stash.ok) {
        return stash;
      }
      stashed = true;
    }
    if ((worktree.value.ahead ?? 0) > 0 && !request.discardChanges) {
      return squadErr({ code: "worktree-unpushed", message: "The selected worktree may contain unpushed commits.", remediation: "Push or merge the branch, then retry cleanup." });
    }

    const removed = await this._remover.remove(mainRoot, worktree.value.displayPath, { force: request.discardChanges, token });
    if (!removed.ok) {
      return squadOk({
        removed: false,
        branchDeleted: false,
        stashed,
        fallback: SquadWorktreeRemovalFallback.None,
        warnings: [{ code: removed.error.code, message: removed.error.message, remediation: removed.error.remediation }],
      });
    }

    let branchDeleted = false;
    if (request.deleteBranch && worktree.value.branch) {
      const deleteResult = await this._git.deleteBranch(mainRoot, worktree.value.branch, false, token);
      branchDeleted = deleteResult.ok;
    }
    await this._git.prune(mainRoot, token);
    this._track("squad.worktree.cleanup", {
      result: "success",
      fallback: removed.value.fallback,
      stashed: String(stashed),
      branchDeleted: String(branchDeleted),
    });
    return squadOk({ removed: true, branchDeleted, stashed, fallback: removed.value.fallback, warnings: [] });
  }

  private async _context(token?: vscode.CancellationToken): Promise<SquadResult<{ workspaceRoot: vscode.Uri; mainRoot: string }>> {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return squadErr({ code: "not-a-workspace", message: "No workspace folder is open.", remediation: "Open the main repository folder and try again." });
    }
    const commonDir = await this._git.commonDir(workspaceRoot.fsPath, token);
    if (!commonDir.ok) {
      return commonDir;
    }
    return squadOk({ workspaceRoot, mainRoot: SquadWorktreeNaming.mainRootFromCommonDir(commonDir.value) });
  }

  private async _resolveBase(
    mainRoot: string,
    requestedBase: string | undefined,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<{ baseBranch: string; warnings: SquadWorktreeWarning[] }>> {
    if (requestedBase?.trim()) {
      return squadOk({ baseBranch: requestedBase.trim().replace(/^origin\//, ""), warnings: [] });
    }
    const remembered = this._workspaceState.get<Record<string, string>>(BASE_MEMORY_KEY, {})[mainRoot];
    if (remembered) {
      return squadOk({ baseBranch: remembered, warnings: [] });
    }
    const detected = await this._git.resolveDefaultBranch(mainRoot, token);
    return detected.ok ? squadOk({ baseBranch: detected.value, warnings: [] }) : detected;
  }

  private async _rememberBase(mainRoot: string, baseBranch: string): Promise<void> {
    const remembered = this._workspaceState.get<Record<string, string>>(BASE_MEMORY_KEY, {});
    await this._workspaceState.update(BASE_MEMORY_KEY, { ...remembered, [mainRoot]: baseBranch });
  }

  private async _branchSource(
    mainRoot: string,
    issueNumber: number,
    computedBranch: string,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<{ branch: string; source: SquadWorktreeBranchSource }>> {
    const refs = await this._git.findBranchesByPrefix(mainRoot, SquadWorktreeNaming.branchPrefix(issueNumber), token);
    if (!refs.ok) {
      return refs;
    }
    const local = refs.value.find((ref) => !ref.remote);
    if (local?.checkedOutPath) {
      return squadErr({ code: "worktree-branch-checked-out", message: "A Squad branch for this issue is already checked out.", remediation: "Open the existing worktree instead." });
    }
    if (local) {
      return squadOk({ branch: local.name, source: SquadWorktreeBranchSource.Local });
    }
    const remote = refs.value.find((ref) => ref.remote);
    if (remote) {
      return squadOk({ branch: remote.name.replace(/^origin\//, ""), source: SquadWorktreeBranchSource.Remote });
    }
    return squadOk({ branch: computedBranch, source: SquadWorktreeBranchSource.New });
  }

  private async _addWorktree(
    mainRoot: string,
    worktreePath: string,
    branch: string,
    source: SquadWorktreeBranchSource,
    baseBranch: string,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<void>> {
    if (source === SquadWorktreeBranchSource.Local) {
      return this._git.addWorktree(mainRoot, { path: worktreePath, branch, newBranch: false, track: false }, token);
    }
    if (source === SquadWorktreeBranchSource.Remote) {
      return this._git.addWorktree(mainRoot, { path: worktreePath, branch, startPoint: `origin/${branch}`, newBranch: true, track: true }, token);
    }
    return this._git.addWorktree(mainRoot, { path: worktreePath, branch, startPoint: `origin/${baseBranch}`, newBranch: true, track: false }, token);
  }

  private async _toInfo(mainRoot: string, entry: GitWorktreeEntry, token?: vscode.CancellationToken): Promise<SquadWorktreeInfo> {
    const id = SquadWorktreeNaming.opaqueId(entry.path);
    this._pathById.set(id, entry.path);
    const dirty = entry.prunable ? null : await this._git.status(entry.path, token).then((result) => (result.ok ? result.value : null));
    const baseBranch = entry.branch ? await this._git.getConfig(mainRoot, `branch.${entry.branch}.nexkitBase`, token).then((result) => (result.ok ? result.value : null)) : null;
    const aheadBehind =
      entry.branch && baseBranch
        ? await this._git.aheadBehind(mainRoot, entry.branch, `origin/${baseBranch}`, token).then((result) => (result.ok ? result.value : null))
        : null;
    return {
      id,
      displayPath: entry.path,
      branch: entry.branch,
      head: entry.head,
      issueNumber: SquadWorktreeNaming.parseIssueFromBranch(entry.branch),
      isMain: entry.isMain,
      isCurrentWindow: this._getWorkspaceRoot()?.fsPath === entry.path,
      locked: entry.locked,
      prunable: entry.prunable,
      dirty,
      ahead: aheadBehind?.ahead ?? null,
      behind: aheadBehind?.behind ?? null,
      baseBranch,
      dependencies: await dependencyState(entry.path),
    };
  }

  private async _findWorktreeById(mainRoot: string, id: string, token?: vscode.CancellationToken): Promise<SquadResult<SquadWorktreeInfo>> {
    const listed = await this.list(token);
    if (!listed.ok) {
      return listed;
    }
    const match = listed.value.find((worktree) => worktree.id === id);
    if (!match) {
      return squadErr({ code: "invalid-input", message: "The selected worktree id is not known.", remediation: "Refresh the worktree list, then retry." });
    }
    return squadOk(match);
  }

  private async _resolvePathById(id: string): Promise<SquadResult<string>> {
    const cached = this._pathById.get(id);
    if (cached) {
      return squadOk(cached);
    }
    const listed = await this.list();
    if (!listed.ok) {
      return listed;
    }
    const match = listed.value.find((worktree) => worktree.id === id);
    return match ? squadOk(match.displayPath) : squadErr({ code: "invalid-input", message: "The selected worktree id is not known.", remediation: "Refresh the worktree list, then retry." });
  }

  private async _copyUntracked(mainRoot: string, worktreePath: string): Promise<number> {
    let count = 0;
    for (const relative of this._settings.copyUntracked()) {
      if (!isAllowedCopyRelativePath(relative)) {
        this._logger.warn("Ignoring unsafe Squad worktree copyUntracked entry.");
        continue;
      }
      const source = path.join(mainRoot, relative);
      const target = path.join(worktreePath, relative);
      if (!(await exists(source)) || (await exists(target))) {
        continue;
      }
      await fs.promises.cp(source, target, { recursive: true, errorOnExist: true, force: false });
      count += 1;
    }
    return count;
  }

  private async _longPathWarnings(
    mainRoot: string,
    worktreePath: string,
    ref: string,
    token?: vscode.CancellationToken
  ): Promise<SquadWorktreeWarning[]> {
    if (process.platform !== "win32") {
      return [];
    }
    const maxPath = await this._git.lsTreeMaxPathLength(mainRoot, ref, token);
    if (maxPath.ok && worktreePath.length + 1 + maxPath.value > WINDOWS_MAX_PATH) {
      return [{
        code: "worktree-path-too-long",
        message: "This worktree may exceed the Windows legacy path limit.",
        remediation: "Use a shorter `nexkit.squad.worktree.parentDirectory` or enable Git long paths with consent.",
      }];
    }
    return [];
  }

  private async _withRepoLock<T>(mainRoot: string, operation: () => Promise<SquadResult<T>>): Promise<SquadResult<T>> {
    const previous = this._mutex.get(mainRoot) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this._mutex.set(mainRoot, previous.then(() => current));
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this._mutex.get(mainRoot) === current) {
        this._mutex.delete(mainRoot);
      }
    }
  }

  private _track(eventName: string, properties: Record<string, string>): void {
    try {
      if (SettingsManager.isSquadTelemetryEnabled()) {
        this._telemetry?.trackEvent(eventName, properties);
      }
    } catch {
      // Telemetry must never affect worktree operations.
    }
  }
}

async function exists(fsPath: string): Promise<boolean> {
  try {
    await fs.promises.access(fsPath);
    return true;
  } catch {
    return false;
  }
}

async function dependencyState(worktreePath: string): Promise<SquadWorktreeDependencyState> {
  try {
    const stat = await fs.promises.lstat(path.join(worktreePath, "node_modules"));
    return stat.isSymbolicLink() ? SquadWorktreeDependencyState.Linked : SquadWorktreeDependencyState.Installed;
  } catch {
    return SquadWorktreeDependencyState.Unknown;
  }
}

function isAllowedCopyRelativePath(relative: string): boolean {
  const normalized = path.normalize(relative);
  return (
    Boolean(relative.trim()) &&
    !path.isAbsolute(relative) &&
    !normalized.startsWith("..") &&
    normalized !== ".." &&
    !path.basename(normalized).toLowerCase().startsWith(".env")
  );
}

function cleanupBlockers(worktree: SquadWorktreeInfo, state: SquadWorkState | undefined): ("dirty" | "unpushed" | "current-window" | "locked")[] {
  const blockers: ("dirty" | "unpushed" | "current-window" | "locked")[] = [];
  if (worktree.dirty) {
    blockers.push("dirty");
  }
  if ((worktree.ahead ?? 0) > 0 && state?.pullRequest !== "merged") {
    blockers.push("unpushed");
  }
  if (worktree.isCurrentWindow) {
    blockers.push("current-window");
  }
  if (worktree.locked) {
    blockers.push("locked");
  }
  return blockers;
}
