import * as fs from "fs";
import * as path from "path";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Service for adding NexKit file exclusions to .git/info/exclude.
 * This keeps the exclusion invisible to the repository (not committed),
 * unlike .gitignore which would be tracked by git.
 * Handles both regular repos (.git is a directory) and worktrees (.git is a file).
 * Also migrates any existing NexKit section from .gitignore on first run.
 */
export class GitExcludeConfigDeployer {
  private readonly _logging = LoggingService.getInstance();

  /**
   * Add .nexkit/ to .git/info/exclude and remove any legacy NexKit section from .gitignore.
   * Safe to call repeatedly — idempotent.
   */
  public async deployGitExclude(targetRoot: string): Promise<void> {
    const excludePath = await this._resolveExcludePath(targetRoot);

    if (!excludePath) {
      this._logging.warn("Could not locate .git/info/exclude — NexKit files will not be excluded from git tracking");
      return;
    }

    await fs.promises.mkdir(path.dirname(excludePath), { recursive: true });

    let content = "";
    try {
      content = await fs.promises.readFile(excludePath, "utf8");
    } catch {
      // File does not exist yet — will be created
    }

    if (!content.includes(".nexkit/")) {
      if (content.length > 0 && !content.endsWith("\n")) {
        content += "\n";
      }
      content += "\n# NexKit extension files (local only)\n.nexkit/\n";
      await fs.promises.writeFile(excludePath, content, "utf8");
      this._logging.info("Added .nexkit/ to .git/info/exclude");
    }

    await this._cleanupGitignore(targetRoot);
  }

  /**
   * Resolve the path to .git/info/exclude, handling both regular repos and worktrees.
   * For worktrees, resolves to the common git dir so the exclusion applies across all worktrees.
   */
  private async _resolveExcludePath(workspaceRoot: string): Promise<string | null> {
    const gitPath = path.join(workspaceRoot, ".git");

    try {
      const stat = await fs.promises.stat(gitPath);

      if (stat.isDirectory()) {
        return path.join(gitPath, "info", "exclude");
      }

      if (stat.isFile()) {
        // Worktree: .git is a file containing "gitdir: <path>"
        const fileContent = await fs.promises.readFile(gitPath, "utf8");
        const match = fileContent.match(/^gitdir:\s*(.+)$/m);
        if (!match) {
          return null;
        }

        const worktreeGitDir = match[1].trim();
        const resolvedWorktreeDir = path.isAbsolute(worktreeGitDir)
          ? worktreeGitDir
          : path.resolve(workspaceRoot, worktreeGitDir);

        // Worktrees have a "commondir" file pointing to the main .git directory
        try {
          const commondirContent = await fs.promises.readFile(path.join(resolvedWorktreeDir, "commondir"), "utf8");
          const commonDir = commondirContent.trim();
          const resolvedCommonDir = path.isAbsolute(commonDir) ? commonDir : path.resolve(resolvedWorktreeDir, commonDir);
          return path.join(resolvedCommonDir, "info", "exclude");
        } catch {
          return path.join(resolvedWorktreeDir, "info", "exclude");
        }
      }
    } catch {
      // .git does not exist or cannot be accessed (e.g. non-git workspace)
    }

    return null;
  }

  /**
   * Remove any legacy NexKit section from .gitignore left over from previous versions.
   */
  private async _cleanupGitignore(targetRoot: string): Promise<void> {
    const gitignorePath = path.join(targetRoot, ".gitignore");

    try {
      let content = await fs.promises.readFile(gitignorePath, "utf8");
      const sectionRegex = /\n?# BEGIN NexKit[\s\S]*?# END NexKit\n?/;

      if (sectionRegex.test(content)) {
        content = content.replace(sectionRegex, "").replace(/\n{3,}/g, "\n\n");
        await fs.promises.writeFile(gitignorePath, content, "utf8");
        this._logging.info("Removed legacy NexKit section from .gitignore (migrated to .git/info/exclude)");
      }
    } catch {
      // .gitignore does not exist — nothing to clean up
    }
  }
}
