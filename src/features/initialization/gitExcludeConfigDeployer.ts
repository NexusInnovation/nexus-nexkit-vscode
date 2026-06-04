import * as fs from "fs";
import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";

/**
 * Service for adding NexKit exclusions to .git/info/exclude.
 * Uses the local-only exclude file instead of .gitignore to keep NexKit invisible in the project repo.
 * Also cleans up any legacy NexKit section from .gitignore if present.
 */
export class GitExcludeConfigDeployer {
  /**
   * Add .nexkit/ to .git/info/exclude. Creates the file if it doesn't exist.
   * Also removes any legacy # BEGIN NexKit...# END NexKit section from .gitignore.
   * Safe to call repeatedly — idempotent.
   */
  public async deployGitExclude(targetRoot: string): Promise<void> {
    const gitDir = path.join(targetRoot, ".git");

    // Skip silently if this is not a git repository
    if (!(await fileExists(gitDir))) {
      return;
    }

    const gitInfoDir = path.join(gitDir, "info");
    const excludePath = path.join(gitInfoDir, "exclude");

    await fs.promises.mkdir(gitInfoDir, { recursive: true });

    let content = "";
    if (await fileExists(excludePath)) {
      content = await fs.promises.readFile(excludePath, "utf8");
    }

    const nexkitPattern = ".nexkit/";
    const lines = content.split("\n");
    const hasPattern = lines.some((line) => line.trim() === nexkitPattern);

    if (!hasPattern) {
      if (content.length > 0 && !content.endsWith("\n")) {
        content += "\n";
      }
      content += `# NexKit (managed by NexKit extension)\n${nexkitPattern}\n`;
      await fs.promises.writeFile(excludePath, content, "utf8");
    }

    await this._cleanupGitignore(targetRoot);
  }

  /**
   * Remove any legacy NexKit section from .gitignore.
   * This cleans up entries added by older versions of NexKit.
   */
  private async _cleanupGitignore(targetRoot: string): Promise<void> {
    const gitignorePath = path.join(targetRoot, ".gitignore");
    if (!(await fileExists(gitignorePath))) {
      return;
    }

    let content = await fs.promises.readFile(gitignorePath, "utf8");
    const sectionRegex = /\n?# BEGIN NexKit[\s\S]*?# END NexKit\n?/;

    if (sectionRegex.test(content)) {
      content = content.replace(sectionRegex, "");
      // Collapse any resulting triple+ blank lines into double
      content = content.replace(/\n{3,}/g, "\n\n");
      await fs.promises.writeFile(gitignorePath, content, "utf8");
    }
  }
}
