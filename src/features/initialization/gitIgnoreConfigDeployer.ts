import * as fs from "fs";
import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";

/**
 * Service for deploying .gitignore file to workspace
 */
export class GitIgnoreConfigDeployer {
  /**
   * Create or update .gitignore file with NexKit patterns. Preserves existing content by using delimited section markers
   */
  public async deployGitignore(targetRoot: string): Promise<void> {
    const gitignorePath = path.join(targetRoot, ".gitignore");

    // Define NexKit section with clear delimiters
    const nexkitSection = `# BEGIN NexKit
.specify/
.github/**/nexkit.*
.github/agents/
.github/skills/
.github/chatmodes/
.github/instructions/
.github/prompts/
# END NexKit`;

    let content = "";

    // Read existing content if file exists
    if (await fileExists(gitignorePath)) {
      content = await fs.promises.readFile(gitignorePath, "utf8");
    }

    // Check if NexKit section already exists
    const sectionRegex = /# BEGIN NexKit[\s\S]*?# END NexKit/;

    if (sectionRegex.test(content)) {
      // Replace existing NexKit section
      content = content.replace(sectionRegex, nexkitSection);
    } else {
      // Append new NexKit section
      if (content.length > 0 && !content.endsWith("\n")) {
        content += "\n";
      }
      if (content.length > 0) {
        content += "\n"; // Add blank line before section
      }
      content += nexkitSection + "\n";
    }

    await fs.promises.writeFile(gitignorePath, content, "utf8");
  }
}
