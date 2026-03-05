import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Service that monitors the .nexkit/ directory for external file changes.
 * When a user manually modifies a managed file, the service rolls back the change
 * and prompts the user to confirm whether they want to keep their modifications.
 *
 * Changes made internally by Nexkit are suppressed using either:
 * - suppressPath() for individual file operations
 * - beginBulkOperation() / endBulkOperation() for batch operations
 */
export class NexkitFileWatcherService implements vscode.Disposable {
  private static _instance: NexkitFileWatcherService | undefined;

  private _watcher: vscode.FileSystemWatcher | undefined;
  private readonly _fileCache: Map<string, string> = new Map();
  private readonly _suppressedPaths: Set<string> = new Set();
  private readonly _logging = LoggingService.getInstance();
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _processingPaths: Set<string> = new Set();
  private _bulkSuppressionDepth = 0;

  /**
   * Get or create the singleton instance
   */
  public static getInstance(): NexkitFileWatcherService {
    if (!NexkitFileWatcherService._instance) {
      NexkitFileWatcherService._instance = new NexkitFileWatcherService();
    }
    return NexkitFileWatcherService._instance;
  }

  /**
   * Start watching the .nexkit/ directory for file changes.
   * Call this after extension activation.
   */
  public async startWatching(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this._logging.info("No workspace folder open, skipping .nexkit file watcher setup");
      return;
    }

    const nexkitDir = path.join(workspaceFolder.uri.fsPath, ".nexkit");

    // Initial cache of existing files
    await this.cacheDirectoryContents(nexkitDir);

    // Create file system watcher for .nexkit/**/*
    const pattern = new vscode.RelativePattern(workspaceFolder, ".nexkit/**/*");
    this._watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this._disposables.push(this._watcher.onDidChange((uri) => this.handleFileChange(uri)));
    this._disposables.push(this._watcher.onDidCreate((uri) => this.handleFileCreate(uri)));
    this._disposables.push(this._watcher.onDidDelete((uri) => this.handleFileDelete(uri)));
    this._disposables.push(this._watcher);

    this._logging.info("Started watching .nexkit/ directory for external changes");
  }

  /**
   * Mark a file path as an expected internal change.
   * Call this before Nexkit writes to or deletes from .nexkit/.
   * The next filesystem event for this path will be ignored.
   */
  public suppressPath(filePath: string): void {
    this._suppressedPaths.add(path.normalize(filePath));
  }

  /**
   * Begin a bulk operation that may modify many files in .nexkit/.
   * All filesystem events are ignored until endBulkOperation() is called.
   * Calls can be nested safely.
   */
  public beginBulkOperation(): void {
    this._bulkSuppressionDepth++;
  }

  /**
   * End a bulk operation and rescan the cache.
   * When the last nested bulk operation ends, the file cache is rebuilt.
   */
  public async endBulkOperation(): Promise<void> {
    this._bulkSuppressionDepth = Math.max(0, this._bulkSuppressionDepth - 1);
    if (this._bulkSuppressionDepth === 0) {
      await this.rescanCache();
    }
  }

  /**
   * Check whether a file path is currently suppressed (internal change).
   * If suppressed via suppressPath(), the path is removed from the set.
   */
  private isSuppressed(filePath: string): boolean {
    if (this._bulkSuppressionDepth > 0) {
      return true;
    }
    const normalized = path.normalize(filePath);
    if (this._suppressedPaths.has(normalized)) {
      this._suppressedPaths.delete(normalized);
      return true;
    }
    return false;
  }

  /**
   * Rebuild the file cache by scanning the .nexkit/ directory.
   */
  private async rescanCache(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }
    this._fileCache.clear();
    await this.cacheDirectoryContents(path.join(workspaceFolder.uri.fsPath, ".nexkit"));
  }

  /**
   * Cache the contents of all files in a directory recursively.
   */
  private async cacheDirectoryContents(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath);
    } catch {
      return;
    }

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.cacheDirectoryContents(fullPath);
        } else if (entry.isFile()) {
          try {
            const content = await fs.promises.readFile(fullPath, "utf8");
            this._fileCache.set(path.normalize(fullPath), content);
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  /**
   * Handle file modification events.
   * Rolls back user changes and prompts to confirm.
   */
  private async handleFileChange(uri: vscode.Uri): Promise<void> {
    const filePath = path.normalize(uri.fsPath);

    if (this.isSuppressed(filePath)) {
      try {
        const content = await fs.promises.readFile(filePath, "utf8");
        this._fileCache.set(filePath, content);
      } catch {
        // Ignore read errors
      }
      return;
    }

    // Prevent re-entrant handling
    if (this._processingPaths.has(filePath)) {
      return;
    }
    this._processingPaths.add(filePath);

    try {
      const originalContent = this._fileCache.get(filePath);
      if (originalContent === undefined) {
        // File not in cache, just cache it
        try {
          const content = await fs.promises.readFile(filePath, "utf8");
          this._fileCache.set(filePath, content);
        } catch {
          // Ignore
        }
        return;
      }

      // Read user's modified content
      let userContent: string;
      try {
        userContent = await fs.promises.readFile(filePath, "utf8");
      } catch {
        return;
      }

      // If content hasn't actually changed, skip
      if (userContent === originalContent) {
        return;
      }

      // Rollback the change
      this._suppressedPaths.add(filePath);
      await fs.promises.writeFile(filePath, originalContent, "utf8");

      const relativePath = this.getRelativePath(filePath);

      // Prompt user
      const choice = await vscode.window.showWarningMessage(
        `The file "${relativePath}" is managed by Nexkit. Your changes have been temporarily reverted. Would you like to restore your changes?`,
        "Keep My Changes",
        "OK"
      );

      if (choice === "Keep My Changes") {
        this._suppressedPaths.add(filePath);
        await fs.promises.writeFile(filePath, userContent, "utf8");
        this._fileCache.set(filePath, userContent);
        this._logging.info(`User chose to keep manual changes to ${relativePath}`);
      } else {
        this._logging.info(`Reverted external changes to ${relativePath}`);
      }
    } finally {
      this._processingPaths.delete(filePath);
    }
  }

  /**
   * Handle file creation events.
   * Warns user about manually created files in the managed directory.
   */
  private async handleFileCreate(uri: vscode.Uri): Promise<void> {
    const filePath = path.normalize(uri.fsPath);

    if (this.isSuppressed(filePath)) {
      try {
        const content = await fs.promises.readFile(filePath, "utf8");
        this._fileCache.set(filePath, content);
      } catch {
        // Ignore
      }
      return;
    }

    // Cache the new file
    try {
      const content = await fs.promises.readFile(filePath, "utf8");
      this._fileCache.set(filePath, content);
    } catch {
      return;
    }

    const relativePath = this.getRelativePath(filePath);
    this._logging.warn(`File "${relativePath}" was manually created in the .nexkit directory`);

    vscode.window.showWarningMessage(
      `The file "${relativePath}" was created in the .nexkit/ directory which is managed by Nexkit. It may be overwritten or removed during template updates.`
    );
  }

  /**
   * Handle file deletion events.
   * Restores deleted managed files and prompts to confirm deletion.
   */
  private async handleFileDelete(uri: vscode.Uri): Promise<void> {
    const filePath = path.normalize(uri.fsPath);

    if (this.isSuppressed(filePath)) {
      this._fileCache.delete(filePath);
      return;
    }

    // Prevent re-entrant handling
    if (this._processingPaths.has(filePath)) {
      return;
    }
    this._processingPaths.add(filePath);

    try {
      const originalContent = this._fileCache.get(filePath);
      if (originalContent === undefined) {
        return;
      }

      // Restore the deleted file
      this._suppressedPaths.add(filePath);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, originalContent, "utf8");

      const relativePath = this.getRelativePath(filePath);

      const choice = await vscode.window.showWarningMessage(
        `The file "${relativePath}" is managed by Nexkit and has been restored. Do you want to delete it permanently?`,
        "Delete Anyway",
        "OK"
      );

      if (choice === "Delete Anyway") {
        this._suppressedPaths.add(filePath);
        await fs.promises.unlink(filePath);
        this._fileCache.delete(filePath);
        this._logging.info(`User chose to delete managed file ${relativePath}`);
      } else {
        this._logging.info(`Restored externally deleted file ${relativePath}`);
      }
    } finally {
      this._processingPaths.delete(filePath);
    }
  }

  /**
   * Get workspace-relative path for display purposes.
   */
  private getRelativePath(filePath: string): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    return path.relative(workspaceRoot, filePath);
  }

  /**
   * Dispose of the watcher and clean up resources
   */
  public dispose(): void {
    this._disposables.forEach((d) => d.dispose());
    this._disposables.length = 0;
    this._watcher = undefined;
    this._fileCache.clear();
    this._suppressedPaths.clear();
    this._processingPaths.clear();
    NexkitFileWatcherService._instance = undefined;
  }
}
