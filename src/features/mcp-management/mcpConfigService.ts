import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { SettingsManager } from "../../core/settingsManager";
import { Commands } from "../../shared/constants/commands";
import { getWorkspaceRoot } from "../../shared/utils/fileHelper";

export interface MCPConfig {
  servers: { [serverName: string]: MCPServerConfig };
  inputs?: Array<{
    id: string;
    type: string;
    description: string;
  }>;
}

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: { [key: string]: string };
  type?: string;
}

/**
 * Unified service for managing MCP (Model Context Protocol) configurations
 * Handles both user-level and workspace-level MCP server configurations
 */
export class MCPConfigService {
  public static readonly Context7ServerName = "context7";
  public static readonly SequentialThinkingServerName = "sequential-thinking";

  /**
   * Check if required user-level MCP servers are configured
   */
  public async checkRequiredUserMCPs(): Promise<{ configured: string[]; missing: string[] }> {
    const requiredServers = [MCPConfigService.Context7ServerName, MCPConfigService.SequentialThinkingServerName];
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
   * Check for required MCP servers and show notification if missing
   */
  public async promptInstallRequiredMCPsOnActivation(): Promise<void> {
    try {
      const { missing } = await this.checkRequiredUserMCPs();

      if (missing.length > 0) {
        // Check if user has dismissed this notification before
        if (!SettingsManager.isMcpSetupDismissed()) {
          const result = await vscode.window.showInformationMessage(
            `Nexkit requires MCP servers: ${missing.join(", ")}. Install now?`,
            "Install",
            "Later",
            "Don't Ask Again"
          );

          if (result === "Install") {
            vscode.commands.executeCommand(Commands.INSTALL_USER_MCPS);
          } else if (result === "Don't Ask Again") {
            await SettingsManager.setMcpSetupDismissed(true);
          }
        }
      }
    } catch (error) {
      console.error("Error checking MCP servers:", error);
    }
  }

  /**
   * Add a server to user-level MCP config
   */
  public async addUserMCPServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    await this.updateMCPConfig(this.getUserMCPConfigPath(), {
      serversToAdd: { [serverName]: serverConfig },
    });
  }

  /**
   * Add a server to workspace-level MCP config
   */
  public async addWorkspaceMCPServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    await this.updateMCPConfig(this.getWorkspaceMCPConfigPath(), {
      serversToAdd: { [serverName]: serverConfig },
    });
  }

  /**
   * Update MCP config by merging with existing content
   * Only modifies specified servers, preserves everything else
   */
  private async updateMCPConfig(
    configPath: string,
    updates: {
      serversToAdd?: { [name: string]: MCPServerConfig };
      serversToRemove?: string[];
      inputsToAdd?: any[];
      otherUpdates?: any;
    }
  ): Promise<void> {
    // Read existing config
    let config: any = { servers: {} };
    try {
      const content = await fs.promises.readFile(configPath, "utf8");
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
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  }

  /**
   * Get the path to user-level MCP config file
   */
  private getUserMCPConfigPath(): string {
    const platform = os.platform();
    let configDir: string;

    if (platform === "win32") {
      configDir = path.join(os.homedir(), "AppData", "Roaming", "Code", "User");
    } else if (platform === "darwin") {
      configDir = path.join(os.homedir(), "Library", "Application Support", "Code", "User");
    } else {
      configDir = path.join(os.homedir(), ".config", "Code", "User");
    }

    return path.join(configDir, "mcp.json");
  }

  /**
   * Read user-level MCP configuration
   */
  private async readUserMCPConfig(): Promise<MCPConfig> {
    const configPath = this.getUserMCPConfigPath();

    try {
      const content = await fs.promises.readFile(configPath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      // Return empty config if file doesn't exist or is invalid
      return { servers: {} };
    }
  }

  /**
   * Get the path to workspace-level MCP config file
   */
  private getWorkspaceMCPConfigPath(): string {
    const workspaceRoot = getWorkspaceRoot();
    const configPath = path.join(workspaceRoot, ".vscode", "mcp.json");

    return configPath;
  }

  /**
   * Read workspace-level MCP configuration
   */
  private async readWorkspaceMCPConfig(): Promise<MCPConfig> {
    try {
      const content = await fs.promises.readFile(this.getWorkspaceMCPConfigPath(), "utf8");
      return JSON.parse(content);
    } catch (error) {
      // Return empty config if file doesn't exist or is invalid
      return { servers: {} };
    }
  }

  /**
   * Validate if an MCP server is properly configured
   */
  private async validateMCPServer(serverName: string, isUserLevel: boolean = true): Promise<boolean> {
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
      if (server.command === "npx" && (!server.args || server.args.length === 0)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }
}
