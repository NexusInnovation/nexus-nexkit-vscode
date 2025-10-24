import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface MCPConfig {
  servers: { [serverName: string]: MCPServerConfig };
}

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: { [key: string]: string };
}

export class MCPConfigManager {
  /**
   * Get the path to user-level MCP config file
   */
  private getUserMCPConfigPath(): string {
    const platform = os.platform();
    let configDir: string;

    if (platform === 'win32') {
      configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User');
    } else if (platform === 'darwin') {
      configDir = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
    } else {
      configDir = path.join(os.homedir(), '.config', 'Code', 'User');
    }

    return path.join(configDir, 'mcp.json');
  }

  /**
   * Get the path to workspace-level MCP config file
   */
  private getWorkspaceMCPConfigPath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }
    return path.join(workspaceFolder.uri.fsPath, '.vscode', 'mcp.json');
  }

  /**
   * Read user-level MCP configuration
   */
  async readUserMCPConfig(): Promise<MCPConfig> {
    const configPath = this.getUserMCPConfigPath();

    try {
      const content = await fs.promises.readFile(configPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // Return empty config if file doesn't exist or is invalid
      return { servers: {} };
    }
  }

  /**
   * Write user-level MCP configuration
   */
  async writeUserMCPConfig(config: MCPConfig): Promise<void> {
    const configPath = this.getUserMCPConfigPath();
    const configDir = path.dirname(configPath);

    // Ensure directory exists
    await fs.promises.mkdir(configDir, { recursive: true });

    // Write config file
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  /**
   * Read workspace-level MCP configuration
   */
  async readWorkspaceMCPConfig(): Promise<MCPConfig> {
    const configPath = this.getWorkspaceMCPConfigPath();

    try {
      const content = await fs.promises.readFile(configPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // Return empty config if file doesn't exist or is invalid
      return { servers: {} };
    }
  }

  /**
   * Write workspace-level MCP configuration
   */
  async writeWorkspaceMCPConfig(config: MCPConfig): Promise<void> {
    const configPath = this.getWorkspaceMCPConfigPath();
    const configDir = path.dirname(configPath);

    // Ensure directory exists
    await fs.promises.mkdir(configDir, { recursive: true });

    // Write config file
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  /**
   * Validate if an MCP server is properly configured
   */
  async validateMCPServer(serverName: string, isUserLevel: boolean = true): Promise<boolean> {
    try {
      const config = isUserLevel ? await this.readUserMCPConfig() : await this.readWorkspaceMCPConfig();
      const server = config.servers[serverName];

      if (!server) {
        return false;
      }

      // Basic validation: check required fields
      if (!server.command) {
        return false;
      }

      // For npx commands, check if args are provided
      if (server.command === 'npx' && (!server.args || server.args.length === 0)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if required user-level MCP servers are configured
   */
  async checkRequiredUserMCPs(): Promise<{ configured: string[], missing: string[] }> {
    const requiredServers = ['context7', 'sequentialthinking'];
    const configured: string[] = [];
    const missing: string[] = [];

    for (const server of requiredServers) {
      const isValid = await this.validateMCPServer(server, true);
      if (isValid) {
        configured.push(server);
      } else {
        missing.push(server);
      }
    }

    return { configured, missing };
  }

  /**
   * Add a server to user-level MCP config
   */
  async addUserMCPServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    const config = await this.readUserMCPConfig();
    config.servers[serverName] = serverConfig;
    await this.writeUserMCPConfig(config);
  }

  /**
   * Add a server to workspace-level MCP config
   */
  async addWorkspaceMCPServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    const config = await this.readWorkspaceMCPConfig();
    config.servers[serverName] = serverConfig;
    await this.writeWorkspaceMCPConfig(config);
  }

  /**
   * Remove a server from user-level MCP config
   */
  async removeUserMCPServer(serverName: string): Promise<void> {
    const config = await this.readUserMCPConfig();
    delete config.servers[serverName];
    await this.writeUserMCPConfig(config);
  }

  /**
   * Remove a server from workspace-level MCP config
   */
  async removeWorkspaceMCPServer(serverName: string): Promise<void> {
    const config = await this.readWorkspaceMCPConfig();
    delete config.servers[serverName];
    await this.writeWorkspaceMCPConfig(config);
  }
}