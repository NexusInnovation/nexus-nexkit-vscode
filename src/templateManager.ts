import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface DeploymentConfig {
  alwaysDeploy: string[];
  conditionalDeploy: { [settingKey: string]: string[] };
  workspaceMCPs: string[];
}

export class TemplateManager {
  private extensionContext: vscode.ExtensionContext;
  private templatesPath: string;

  constructor(context: vscode.ExtensionContext) {
    this.extensionContext = context;
    this.templatesPath = path.join(
      context.extensionPath,
      "resources",
      "templates"
    );
  }

  /**
   * Deep merge two objects, with target values taking priority
   * @param source - Base object (template settings)
   * @param target - Override object (user settings) - these values win
   * @returns Merged object
   */
  private deepMerge(source: any, target: any): any {
    const result: any = { ...source };
    for (const key in target) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        if (
          target[key] &&
          typeof target[key] === "object" &&
          !Array.isArray(target[key]) &&
          !Array.isArray(source[key])
        ) {
          result[key] = this.deepMerge(source[key] ?? {}, target[key]);
        } else {
          // Primitive, array, or only one side is object - target wins
          result[key] = target[key];
        }
      }
    }
    return result;
  }

  /**
   * Deploy templates to the workspace based on configuration
   */
  async deployTemplates(config: DeploymentConfig): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder open");
    }

    // Always deploy core templates
    for (const template of config.alwaysDeploy) {
      await this.deployTemplate(template, workspaceFolder.uri.fsPath);
    }

    // Deploy conditional templates based on settings
    for (const [settingKey, templates] of Object.entries(
      config.conditionalDeploy
    )) {
      if (templates.length === 0) {
        continue;
      }

      // Optionally, you could log or use settingKey here for debugging
      for (const template of templates) {
        await this.deployTemplate(template, workspaceFolder.uri.fsPath);
      }
    }

    // Deploy workspace MCP configurations
    if (config.workspaceMCPs.length > 0) {
      await this.deployWorkspaceMCPConfig(
        config.workspaceMCPs,
        workspaceFolder.uri.fsPath
      );
    }

    // Deploy VS Code settings if enabled
    const createVscodeSettings = vscode.workspace
      .getConfiguration("nexkit")
      .get("init.createVscodeSettings", true);
    if (createVscodeSettings) {
      await this.deployVscodeSettings(workspaceFolder.uri.fsPath);
    }

    // Create .gitignore if enabled
    const createGitignore = vscode.workspace
      .getConfiguration("nexkit")
      .get("init.createGitignore", true);
    if (createGitignore) {
      await this.createGitignore(workspaceFolder.uri.fsPath);
    }
  }

  /**
   * Dynamically discover all files that should always be deployed
   * Scans resources/templates/.github/chatmodes/ and resources/templates/.github/prompts/
   */
  async discoverAlwaysDeployFiles(): Promise<string[]> {
    const alwaysDeployFiles: string[] = [];

    try {
      // Discover chatmode files
      const chatmodesPath = path.join(
        this.templatesPath,
        ".github",
        "chatmodes"
      );
      if (await this.checkFileExists(chatmodesPath)) {
        const chatmodeFiles = await fs.promises.readdir(chatmodesPath);
        const markdownChatmodes = chatmodeFiles
          .filter((file) => file.endsWith(".md"))
          .sort()
          .map((file) => `.github/chatmodes/${file}`);
        alwaysDeployFiles.push(...markdownChatmodes);
      }

      // Discover prompt files
      const promptsPath = path.join(this.templatesPath, ".github", "prompts");
      if (await this.checkFileExists(promptsPath)) {
        const promptFiles = await fs.promises.readdir(promptsPath);
        const markdownPrompts = promptFiles
          .filter((file) => file.endsWith(".md"))
          .sort()
          .map((file) => `.github/prompts/${file}`);
        alwaysDeployFiles.push(...markdownPrompts);
      }
    } catch (error) {
      console.error("Error discovering template files:", error);
      // Return empty array on error to fail gracefully
    }

    return alwaysDeployFiles.sort(); // Ensure consistent ordering
  }

  /**
   * Deploy a single template file
   */
  async deployTemplate(
    templatePath: string,
    targetRoot: string
  ): Promise<void> {
    const fullTemplatePath = path.join(this.templatesPath, templatePath);
    const targetPath = path.join(targetRoot, templatePath);

    if (!(await this.checkFileExists(fullTemplatePath))) {
      vscode.window.showWarningMessage(`Template not found: ${templatePath}`);
      return;
    }

    // Ensure target directory exists
    const targetDir = path.dirname(targetPath);
    await fs.promises.mkdir(targetDir, { recursive: true });

    // Read template content
    const content = await fs.promises.readFile(fullTemplatePath, "utf8");

    // Write to target (overwrite existing)
    await fs.promises.writeFile(targetPath, content, "utf8");
  }

  /**
   * Create backup of existing .github directory
   */
  async backupDirectory(sourcePath: string): Promise<string | null> {
    if (!(await this.checkFileExists(sourcePath))) {
      return null; // Nothing to backup
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${sourcePath}.backup-${timestamp}`;

    // Copy directory recursively
    await this.copyDirectory(sourcePath, backupPath);

    return backupPath;
  }

  /**
   * Check if file or directory exists
   */
  async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read template content
   */
  async readTemplate(templatePath: string): Promise<string> {
    const fullPath = path.join(this.templatesPath, templatePath);
    return await fs.promises.readFile(fullPath, "utf8");
  }

  /**
   * Deploy workspace MCP configuration
   * NON-DESTRUCTIVE: Merges with existing configuration
   */
  private async deployWorkspaceMCPConfig(
    mcpServers: string[],
    targetRoot: string
  ): Promise<void> {
    const mcpConfigPath = path.join(targetRoot, ".vscode", "mcp.json");
    const mcpDir = path.dirname(mcpConfigPath);

    await fs.promises.mkdir(mcpDir, { recursive: true });

    // Read existing config or start fresh
    let config: any = { servers: {} };
    if (await this.checkFileExists(mcpConfigPath)) {
      try {
        const existingContent = await fs.promises.readFile(
          mcpConfigPath,
          "utf8"
        );
        config = JSON.parse(existingContent);
        if (!config.servers) {
          config.servers = {};
        }
      } catch (error) {
        console.warn("Existing mcp.json is invalid, starting fresh:", error);
        config = { servers: {} };
      }
    }

    // Add Azure DevOps MCP if selected
    if (mcpServers.includes("azureDevOps")) {
      if (!config.inputs) {
        config.inputs = [];
      }
      // Check if input already exists
      const adoInputExists = config.inputs.some(
        (input: any) => input.id === "ado_org"
      );
      if (!adoInputExists) {
        config.inputs.push({
          id: "ado_org",
          type: "promptString",
          description: "Azure DevOps organization name (e.g. 'contoso')",
        });
      }
      // Add or update the server (overwrite if exists, preserving user's choice to update)
      config.servers.azureDevOps = {
        command: "npx",
        args: ["-y", "@azure-devops/mcp", "${input:ado_org}"],
      };
    }

    // Add additional MCP servers as needed
    for (const serverName of mcpServers) {
      if (serverName !== "azureDevOps") {
        // Handle other server types in the future
        console.log(`MCP server ${serverName} not yet implemented`);
      }
    }

    await fs.promises.writeFile(
      mcpConfigPath,
      JSON.stringify(config, null, 2),
      "utf8"
    );
  }

  /**
   * Deploy VS Code settings
   * NON-DESTRUCTIVE: Deep merges with existing settings, user values take priority
   */
  private async deployVscodeSettings(targetRoot: string): Promise<void> {
    const settingsPath = path.join(targetRoot, ".vscode", "settings.json");
    const settingsDir = path.dirname(settingsPath);

    await fs.promises.mkdir(settingsDir, { recursive: true });

    // Read template settings
    const templateSettings = await this.readTemplate(
      path.join(".vscode", "settings.json")
    );
    let settings = JSON.parse(templateSettings);

    // Merge with existing settings if they exist (user settings take priority)
    if (await this.checkFileExists(settingsPath)) {
      const existingContent = await fs.promises.readFile(settingsPath, "utf8");
      try {
        const existingSettings = JSON.parse(existingContent);
        // Deep merge: template as base, user settings override
        settings = this.deepMerge(settings, existingSettings);
      } catch (error) {
        // If existing settings are invalid JSON, show warning but preserve template
        vscode.window
          .showWarningMessage(
            "Existing .vscode/settings.json is invalid JSON. Using template settings.",
            "View Error"
          )
          .then((selection) => {
            if (selection === "View Error") {
              // Optionally show error details
            }
          });
      }
    }

    await fs.promises.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2),
      "utf8"
    );
  }

  /**
   * Create or update .gitignore file with NexKit patterns
   * Preserves existing content by using delimited section markers
   */
  private async createGitignore(targetRoot: string): Promise<void> {
    const gitignorePath = path.join(targetRoot, ".gitignore");

    // Define NexKit section with clear delimiters
    const nexkitSection = `# BEGIN NexKit
.specify/
.github/**/nexkit.*
.github/chatmodes/
.github/instructions/
.github/prompts/
# END NexKit`;

    let content = "";

    // Read existing content if file exists
    if (await this.checkFileExists(gitignorePath)) {
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

  /**
   * List available backups
   */
  async listBackups(targetRoot: string): Promise<string[]> {
    const backupDir = path.join(targetRoot, ".github.backup-*");
    // Simple glob implementation - in real app would use proper globbing
    try {
      const entries = await fs.promises.readdir(path.dirname(backupDir));
      return entries
        .filter((entry) => entry.startsWith(".github.backup-"))
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Restore from a specific backup
   */
  async restoreBackup(targetRoot: string, backupName: string): Promise<void> {
    const githubPath = path.join(targetRoot, ".github");
    const backupPath = path.join(targetRoot, backupName);

    if (!(await this.checkFileExists(backupPath))) {
      throw new Error(`Backup ${backupName} not found`);
    }

    // Create temp backup of current state
    const tempBackup = `${githubPath}.temp`;
    if (await this.checkFileExists(githubPath)) {
      await this.copyDirectory(githubPath, tempBackup);
    }

    try {
      // Remove current .github
      if (await this.checkFileExists(githubPath)) {
        await fs.promises.rm(githubPath, { recursive: true, force: true });
      }

      // Restore from backup
      await this.copyDirectory(backupPath, githubPath);

      // Clean up temp backup
      if (await this.checkFileExists(tempBackup)) {
        await fs.promises.rm(tempBackup, { recursive: true, force: true });
      }
    } catch (error) {
      // Restore temp backup if something went wrong
      if (await this.checkFileExists(tempBackup)) {
        if (await this.checkFileExists(githubPath)) {
          await fs.promises.rm(githubPath, { recursive: true, force: true });
        }
        await this.copyDirectory(tempBackup, githubPath);
        await fs.promises.rm(tempBackup, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupBackups(targetRoot: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("nexkit");
    const retentionDays = config.get("backup.retentionDays", 30);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const backups = await this.listBackups(targetRoot);

    for (const backup of backups) {
      const backupPath = path.join(targetRoot, backup);
      try {
        const stats = await fs.promises.stat(backupPath);
        if (stats.mtime < cutoffDate) {
          await fs.promises.rm(backupPath, { recursive: true, force: true });
          console.log(`Cleaned up old backup: ${backup}`);
        }
      } catch (error) {
        console.error(`Error cleaning up backup ${backup}:`, error);
      }
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    const stats = await fs.promises.stat(source);

    if (stats.isDirectory()) {
      await fs.promises.mkdir(target, { recursive: true });
      const entries = await fs.promises.readdir(source);

      for (const entry of entries) {
        const sourcePath = path.join(source, entry);
        const targetPath = path.join(target, entry);
        await this.copyDirectory(sourcePath, targetPath);
      }
    } else {
      await fs.promises.copyFile(source, target);
    }
  }
}
