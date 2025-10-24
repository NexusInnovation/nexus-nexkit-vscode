import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
    this.templatesPath = path.join(context.extensionPath, 'resources', 'templates');
  }

  /**
   * Deploy templates to the workspace based on configuration
   */
  async deployTemplates(config: DeploymentConfig): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    // Always deploy core templates
    for (const template of config.alwaysDeploy) {
      await this.deployTemplate(template, workspaceFolder.uri.fsPath);
    }

    // Deploy conditional templates based on settings
    for (const [settingKey, templates] of Object.entries(config.conditionalDeploy)) {
      const enabled = vscode.workspace.getConfiguration('nexkit').get(settingKey, false);
      if (enabled) {
        for (const template of templates) {
          await this.deployTemplate(template, workspaceFolder.uri.fsPath);
        }
      }
    }

    // Deploy workspace MCP configurations
    if (config.workspaceMCPs.length > 0) {
      await this.deployWorkspaceMCPConfig(config.workspaceMCPs, workspaceFolder.uri.fsPath);
    }

    // Deploy VS Code settings if enabled
    const createVscodeSettings = vscode.workspace.getConfiguration('nexkit').get('init.createVscodeSettings', true);
    if (createVscodeSettings) {
      await this.deployVscodeSettings(workspaceFolder.uri.fsPath);
    }

    // Create .gitignore if enabled
    const createGitignore = vscode.workspace.getConfiguration('nexkit').get('init.createGitignore', true);
    if (createGitignore) {
      await this.createGitignore(workspaceFolder.uri.fsPath);
    }
  }

  /**
   * Deploy a single template file
   */
  async deployTemplate(templatePath: string, targetRoot: string): Promise<void> {
    const fullTemplatePath = path.join(this.templatesPath, templatePath);
    const targetPath = path.join(targetRoot, templatePath);

    if (!await this.checkFileExists(fullTemplatePath)) {
      vscode.window.showWarningMessage(`Template not found: ${templatePath}`);
      return;
    }

    // Ensure target directory exists
    const targetDir = path.dirname(targetPath);
    await fs.promises.mkdir(targetDir, { recursive: true });

    // Read template content
    const content = await fs.promises.readFile(fullTemplatePath, 'utf8');

    // Write to target (overwrite existing)
    await fs.promises.writeFile(targetPath, content, 'utf8');
  }

  /**
   * Create backup of existing .github directory
   */
  async backupDirectory(sourcePath: string): Promise<string | null> {
    if (!await this.checkFileExists(sourcePath)) {
      return null; // Nothing to backup
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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
    return await fs.promises.readFile(fullPath, 'utf8');
  }

  /**
   * Deploy workspace MCP configuration
   */
  private async deployWorkspaceMCPConfig(mcpServers: string[], targetRoot: string): Promise<void> {
    const mcpConfigPath = path.join(targetRoot, '.vscode', 'mcp.json');
    const mcpDir = path.dirname(mcpConfigPath);

    await fs.promises.mkdir(mcpDir, { recursive: true });

    const config: any = { servers: {} };

    // Add Azure DevOps MCP if selected
    if (mcpServers.includes('azureDevOps')) {
      config.servers.azureDevOps = {
        command: 'npx',
        args: ['-y', '@azure/devops-mcp-server'],
        env: {
          AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/your-org' // Placeholder
        }
      };
    }

    await fs.promises.writeFile(mcpConfigPath, JSON.stringify(config, null, 2), 'utf8');
  }

  /**
   * Deploy VS Code settings
   */
  private async deployVscodeSettings(targetRoot: string): Promise<void> {
    const settingsPath = path.join(targetRoot, '.vscode', 'settings.json');
    const settingsDir = path.dirname(settingsPath);

    await fs.promises.mkdir(settingsDir, { recursive: true });

    // Read template settings
    const templateSettings = await this.readTemplate(path.join('.vscode', 'settings.json'));
    const settings = JSON.parse(templateSettings);

    // Merge with existing settings if they exist
    if (await this.checkFileExists(settingsPath)) {
      const existingContent = await fs.promises.readFile(settingsPath, 'utf8');
      try {
        const existingSettings = JSON.parse(existingContent);
        Object.assign(settings, existingSettings);
      } catch (error) {
        // If existing settings are invalid, overwrite
        vscode.window.showWarningMessage('Existing .vscode/settings.json is invalid JSON. Overwriting with template.');
      }
    }

    await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }

  /**
   * Create .gitignore file
   */
  private async createGitignore(targetRoot: string): Promise<void> {
    const gitignorePath = path.join(targetRoot, '.gitignore');

    if (await this.checkFileExists(gitignorePath)) {
      return; // Don't overwrite existing .gitignore
    }

    const gitignoreContent = `# Dependencies
node_modules/
__pycache__/
*.pyc
*.pyo
*.pyd

# Environment variables
.env
.env.local

# IDE
.vscode/settings.json
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Build outputs
dist/
build/
out/

# Temporary files
*.tmp
*.temp
`;

    await fs.promises.writeFile(gitignorePath, gitignoreContent, 'utf8');
  }

  /**
   * List available backups
   */
  async listBackups(targetRoot: string): Promise<string[]> {
    const backupDir = path.join(targetRoot, '.github.backup-*');
    // Simple glob implementation - in real app would use proper globbing
    try {
      const entries = await fs.promises.readdir(path.dirname(backupDir));
      return entries
        .filter(entry => entry.startsWith('.github.backup-'))
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
    const githubPath = path.join(targetRoot, '.github');
    const backupPath = path.join(targetRoot, backupName);

    if (!await this.checkFileExists(backupPath)) {
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
    const config = vscode.workspace.getConfiguration('nexkit');
    const retentionDays = config.get('backup.retentionDays', 30);
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