import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getWorkspaceRoot, checkFileExists } from "../helpers/fileSystemHelper";

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
}

/**
 * Unified service for managing MCP (Model Context Protocol) configurations
 * Handles both user-level and workspace-level MCP server configurations
 */
export class MCPConfigService {
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
  async readUserMCPConfig(): Promise<MCPConfig> {
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
   * Read workspace-level MCP configuration
   */
  async readWorkspaceMCPConfig(): Promise<MCPConfig> {
    const workspaceRoot = getWorkspaceRoot();
    const configPath = path.join(workspaceRoot, ".vscode", "mcp.json");

    try {
      const content = await fs.promises.readFile(configPath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      // Return empty config if file doesn't exist or is invalid
      return { servers: {} };
    }
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
      if (server.command === "npx" && (!server.args || server.args.length === 0)) {
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
  async checkRequiredUserMCPs(): Promise<{ configured: string[]; missing: string[] }> {
    const requiredServers = ["context7", "sequential-thinking"];
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
  async checkRequiredMCPs(): Promise<void> {
    try {
      const { missing } = await this.checkRequiredUserMCPs();

      if (missing.length > 0) {
        // Check if user has dismissed this notification before
        const config = vscode.workspace.getConfiguration("nexkit");
        const dismissed = config.get("mcpSetup.dismissed", false);

        if (!dismissed) {
          const result = await vscode.window.showInformationMessage(
            `Nexkit requires MCP servers: ${missing.join(", ")}. Install now?`,
            "Install",
            "Later",
            "Don't Ask Again"
          );

          if (result === "Install") {
            vscode.commands.executeCommand("nexus-nexkit-vscode.installUserMCPs");
          } else if (result === "Don't Ask Again") {
            await config.update("mcpSetup.dismissed", true, vscode.ConfigurationTarget.Global);
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
  async addUserMCPServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    const configPath = this.getUserMCPConfigPath();
    await this.updateMCPConfig(configPath, {
      serversToAdd: { [serverName]: serverConfig },
    });
  }

  /**
   * Add a server to workspace-level MCP config
   */
  async addWorkspaceMCPServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    const configPath = path.join(workspaceRoot, ".vscode", "mcp.json");
    await this.updateMCPConfig(configPath, {
      serversToAdd: { [serverName]: serverConfig },
    });
  }

  /**
   * Deploy workspace MCP configuration for project initialization
   * NON-DESTRUCTIVE: Merges with existing configuration
   * @param mcpServers Array of MCP server identifiers to configure (e.g., ['azureDevOps'])
   * @param targetRoot Root directory of the workspace
   */
  async deployWorkspaceMCPServers(mcpServers: string[], targetRoot: string): Promise<void> {
    const mcpConfigPath = path.join(targetRoot, ".vscode", "mcp.json");
    const mcpDir = path.dirname(mcpConfigPath);

    await fs.promises.mkdir(mcpDir, { recursive: true });

    // Read existing config or start fresh
    let config: any = { servers: {} };
    if (await checkFileExists(mcpConfigPath)) {
      try {
        const existingContent = await fs.promises.readFile(mcpConfigPath, "utf8");
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
      const adoInputExists = config.inputs.some((input: any) => input.id === "ado_org");
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

    await fs.promises.writeFile(mcpConfigPath, JSON.stringify(config, null, 2), "utf8");
  }
}
