import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SettingsManager } from "../../../core/settingsManager";
import { RepositorySyncRepository } from "../models/repositorySyncModels";

export class RepositoryDiscoveryService implements vscode.Disposable {
  private readonly _onDidRefreshSuggested = new vscode.EventEmitter<void>();
  private readonly _watchers: vscode.FileSystemWatcher[] = [];
  private _debounceTimer: NodeJS.Timeout | undefined;
  private _watchInitialized = false;

  public get onDidRefreshSuggested(): vscode.Event<void> {
    return this._onDidRefreshSuggested.event;
  }

  public async getSyncableRepositories(): Promise<RepositorySyncRepository[]> {
    if (SettingsManager.isRepoSyncScanWatchEnabled()) {
      this._ensureRootPathWatchers();
    } else {
      this._disposeWatchers();
    }

    const descriptors: RepositorySyncRepository[] = [];

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const repositoryPath = this._normalizeAbsolutePath(folder.uri.fsPath);
      if (!repositoryPath) {
        continue;
      }

      descriptors.push({
        key: this._toRepositoryKey(repositoryPath),
        name: folder.name,
        path: repositoryPath,
        source: "workspace",
        isExternal: false,
      });
    }

    for (const externalPath of SettingsManager.getRepoSyncExternalRepositories()) {
      const repositoryPath = this._normalizeAbsolutePath(externalPath);
      if (!repositoryPath) {
        continue;
      }

      descriptors.push({
        key: this._toRepositoryKey(repositoryPath),
        name: path.basename(repositoryPath) || repositoryPath,
        path: repositoryPath,
        source: "external",
        isExternal: true,
      });
    }

    const rootScanRepositories = await this._scanConfiguredRootsForRepositories();
    descriptors.push(...rootScanRepositories);

    return this._dedupeRepositories(descriptors);
  }

  public dispose(): void {
    this._disposeWatchers();
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = undefined;
    }
    this._onDidRefreshSuggested.dispose();
  }

  private _ensureRootPathWatchers(): void {
    if (this._watchInitialized) {
      return;
    }

    const rootPaths = SettingsManager.getRepoSyncScanRootPaths()
      .map((candidate) => this._normalizeAbsolutePath(candidate))
      .filter((candidate): candidate is string => Boolean(candidate));

    for (const rootPath of rootPaths) {
      const pattern = new vscode.RelativePattern(rootPath, "**/.git");
      const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, false);

      watcher.onDidCreate(() => this._scheduleRefreshSignal());
      watcher.onDidDelete(() => this._scheduleRefreshSignal());
      this._watchers.push(watcher);
    }

    this._watchInitialized = true;
  }

  private _scheduleRefreshSignal(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = undefined;
      this._onDidRefreshSuggested.fire();
    }, 1200);
  }

  private _disposeWatchers(): void {
    this._watchInitialized = false;
    for (const watcher of this._watchers) {
      watcher.dispose();
    }
    this._watchers.length = 0;
  }

  private async _scanConfiguredRootsForRepositories(): Promise<RepositorySyncRepository[]> {
    const rootPaths = SettingsManager.getRepoSyncScanRootPaths();
    if (rootPaths.length === 0) {
      return [];
    }

    const maxDepth = Math.max(0, Math.min(5, SettingsManager.getRepoSyncScanMaxDepth()));
    const maxRepositories = Math.max(1, Math.min(500, SettingsManager.getRepoSyncScanMaxRepositories()));
    const foundPaths = new Set<string>();

    for (const configuredRootPath of rootPaths) {
      if (foundPaths.size >= maxRepositories) {
        break;
      }

      const rootPath = this._normalizeAbsolutePath(configuredRootPath);
      if (!rootPath) {
        continue;
      }

      await this._scanRootPath(rootPath, maxDepth, maxRepositories, foundPaths);
    }

    return Array.from(foundPaths).map((repositoryPath) => ({
      key: this._toRepositoryKey(repositoryPath),
      name: path.basename(repositoryPath) || repositoryPath,
      path: repositoryPath,
      source: "root-scan",
      isExternal: true,
    }));
  }

  private async _scanRootPath(
    rootPath: string,
    maxDepth: number,
    maxRepositories: number,
    collector: Set<string>
  ): Promise<void> {
    const queue: Array<{ directoryPath: string; depth: number }> = [{ directoryPath: rootPath, depth: 0 }];

    while (queue.length > 0 && collector.size < maxRepositories) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const { directoryPath, depth } = current;
      const gitDirectoryPath = path.join(directoryPath, ".git");
      if (await this._pathIsDirectory(gitDirectoryPath)) {
        collector.add(this._normalizePathForKey(directoryPath));
        continue;
      }

      if (depth >= maxDepth) {
        continue;
      }

      const directoryEntries = await this._readDirectoryEntries(directoryPath);
      for (const entry of directoryEntries) {
        if (!entry.isDirectory()) {
          continue;
        }

        if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }

        queue.push({ directoryPath: path.join(directoryPath, entry.name), depth: depth + 1 });
      }
    }
  }

  private async _pathIsDirectory(candidatePath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(candidatePath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async _readDirectoryEntries(directoryPath: string): Promise<fs.Dirent[]> {
    try {
      return await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  private _dedupeRepositories(repositories: RepositorySyncRepository[]): RepositorySyncRepository[] {
    const deduped = new Map<string, RepositorySyncRepository>();
    const sourcePriority: Record<RepositorySyncRepository["source"], number> = {
      workspace: 3,
      external: 2,
      "root-scan": 1,
    };

    for (const repository of repositories) {
      const normalizedKey = this._normalizePathForKey(repository.path);
      const existing = deduped.get(normalizedKey);
      if (!existing || sourcePriority[repository.source] > sourcePriority[existing.source]) {
        deduped.set(normalizedKey, repository);
      }
    }

    return Array.from(deduped.values());
  }

  private _toRepositoryKey(repositoryPath: string): string {
    return this._normalizePathForKey(repositoryPath).replace(/[^a-z0-9]+/g, "-");
  }

  private _normalizeAbsolutePath(candidatePath: string | undefined): string | undefined {
    if (!candidatePath || candidatePath.trim().length === 0) {
      return undefined;
    }

    const resolved = path.resolve(candidatePath);
    return this._normalizePathForKey(resolved);
  }

  private _normalizePathForKey(candidatePath: string): string {
    const normalized = path.normalize(candidatePath);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  }
}
