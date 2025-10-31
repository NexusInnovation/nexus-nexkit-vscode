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
   * Update MCP config by merging with existing content
   * Only modifies specified servers, preserves everything else
   */
  private async updateMCPConfig(
    configPath: string,
    updates: {
      serversToAdd?: { [name: string]: MCPServerConfig },
      serversToRemove?: string[],
      inputsToAdd?: any[],
      otherUpdates?: any
    }
  ): Promise<void> {
    // Read existing config
    let config: any = { servers: {} };
    try {
      const content = await fs.promises.readFile(configPath, 'utf8');
      config = JSON.parse(content);
    } catch {
      // File doesn't exist or invalid - start fresh
    }

    // Ensure servers object exists
    if (!config.servers) {
      config.servers = {};
    }

    // Add/update servers
    if (updates.serversToAdd) {
      Object.assign(config.servers, updates.serversToAdd);
    }

    // Remove servers
    if (updates.serversToRemove) {
      for (const serverName of updates.serversToRemove) {
        delete config.servers[serverName];
      }
    }

    // Merge inputs array intelligently (avoid duplicates)
    if (updates.inputsToAdd) {
      if (!config.inputs) {
        config.inputs = [];
      }
      for (const input of updates.inputsToAdd) {
        const exists = config.inputs.some((i: any) => i.id === input.id);
        if (!exists) {
          config.inputs.push(input);
        } else {
          // Update existing input
          const index = config.inputs.findIndex((i: any) => i.id === input.id);
          config.inputs[index] = input;
        }
      }
    }

    // Apply other top-level updates
    if (updates.otherUpdates) {
      Object.assign(config, updates.otherUpdates);
    }

    // Write back
    const configDir = path.dirname(configPath);
    await fs.promises.mkdir(configDir, { recursive: true });
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  }
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
   * @deprecated Use updateMCPConfig() via add/remove methods instead
   * This method overwrites the entire config file
   */
  async writeUserMCPConfig(config: MCPConfig): Promise<void> {
    const configPath = this.getUserMCPConfigPath();
    const configDir = path.dirname(configPath);
    await fs.promises.mkdir(configDir, { recursive: true });
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
   * @deprecated Use updateMCPConfig() via add/remove methods instead
   * This method overwrites the entire config file
   */
  async writeWorkspaceMCPConfig(config: MCPConfig): Promise<void> {
    const configPath = this.getWorkspaceMCPConfigPath();
    const configDir = path.dirname(configPath);
    await fs.promises.mkdir(configDir, { recursive: true });
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
    const requiredServers = ['context7', 'sequential-thinking'];
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
    const configPath = this.getUserMCPConfigPath();
    await this.updateMCPConfig(configPath, {
      serversToAdd: { [serverName]: serverConfig }
    });
  }

  /**
   * Add a server to workspace-level MCP config
   */
  async addWorkspaceMCPServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    const configPath = this.getWorkspaceMCPConfigPath();
    await this.updateMCPConfig(configPath, {
      serversToAdd: { [serverName]: serverConfig }
    });
  }

  /**
   * Remove a server from user-level MCP config
   */
  async removeUserMCPServer(serverName: string): Promise<void> {
    const configPath = this.getUserMCPConfigPath();
    await this.updateMCPConfig(configPath, {
      serversToRemove: [serverName]
    });
  }

  /**
   * Remove a server from workspace-level MCP config
   */
  async removeWorkspaceMCPServer(serverName: string): Promise<void> {
    const configPath = this.getWorkspaceMCPConfigPath();
    await this.updateMCPConfig(configPath, {
      serversToRemove: [serverName]
    });
  }
}