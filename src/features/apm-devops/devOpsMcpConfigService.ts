import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { DevOpsConnection, AZURE_DEVOPS_MCP_DOMAINS } from "./models/devOpsConnection";
import { parseDevOpsUrl, generateServerName, generateConnectionId } from "./devOpsUrlParser";
import { MCPServerConfig } from "../mcp-management/mcpConfigService";
import { getWorkspaceRoot } from "../../shared/utils/fileHelper";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Service for managing Azure DevOps MCP configurations
 * Handles adding, removing, and listing DevOps connections in workspace MCP config
 */
export class DevOpsMcpConfigService {
  private readonly _onConnectionsChanged = new vscode.EventEmitter<void>();
  public readonly onConnectionsChanged = this._onConnectionsChanged.event;

  /**
   * Add a DevOps connection from a URL
   * @param url Azure DevOps project URL
   * @returns The created connection or throws an error
   */
  public async addConnection(url: string): Promise<DevOpsConnection> {
    const parseResult = parseDevOpsUrl(url);

    if (!parseResult.isValid || !parseResult.organization || !parseResult.project) {
      throw new Error(parseResult.error || "Invalid DevOps URL");
    }

    const { organization, project } = parseResult;
    const id = generateConnectionId(organization, project);
    const serverName = generateServerName(organization, project);

    // Check if connection already exists
    const existingConnections = await this.getConnections();
    if (existingConnections.some((c) => c.id === id)) {
      throw new Error(`Connection for ${organization}/${project} already exists`);
    }

    // Generate the MCP server config
    const serverConfig = this.generateServerConfig(organization, project);

    // Add to workspace MCP config
    await this.addToWorkspaceMcpConfig(serverName, serverConfig);

    // Determine if this should be active (first connection is auto-active)
    const isActive = existingConnections.length === 0;

    const connection: DevOpsConnection = {
      id,
      organization,
      project,
      isActive,
      serverName,
    };

    // If this is the first/active connection, store it
    if (isActive) {
      await SettingsManager.setActiveDevOpsConnection(id);
    }

    this._onConnectionsChanged.fire();
    return connection;
  }

  /**
   * Remove a DevOps connection
   * @param connectionId The connection ID to remove
   */
  public async removeConnection(connectionId: string): Promise<void> {
    const connections = await this.getConnections();
    const connection = connections.find((c) => c.id === connectionId);

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Remove from workspace MCP config
    await this.removeFromWorkspaceMcpConfig(connection.serverName);

    // If this was the active connection, clear or set a new one
    const activeId = SettingsManager.getActiveDevOpsConnection();
    if (activeId === connectionId) {
      const remainingConnections = connections.filter((c) => c.id !== connectionId);
      if (remainingConnections.length > 0) {
        await SettingsManager.setActiveDevOpsConnection(remainingConnections[0].id);
      } else {
        await SettingsManager.setActiveDevOpsConnection(null);
      }
    }

    this._onConnectionsChanged.fire();
  }

  /**
   * Set a connection as active
   * @param connectionId The connection ID to activate
   */
  public async setActiveConnection(connectionId: string): Promise<void> {
    const connections = await this.getConnections();
    const connection = connections.find((c) => c.id === connectionId);

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    await SettingsManager.setActiveDevOpsConnection(connectionId);
    this._onConnectionsChanged.fire();
  }

  /**
   * Get all configured DevOps connections
   */
  public async getConnections(): Promise<DevOpsConnection[]> {
    const config = await this.readWorkspaceMcpConfig();
    const activeId = SettingsManager.getActiveDevOpsConnection();
    const connections: DevOpsConnection[] = [];

    for (const [serverName, serverConfig] of Object.entries(config.servers || {})) {
      // Only parse azure-devops-* servers
      if (!serverName.startsWith("azure-devops-")) {
        continue;
      }

      // Extract org and project from args
      const connection = this.parseConnectionFromServerConfig(serverName, serverConfig as MCPServerConfig, activeId);
      if (connection) {
        connections.push(connection);
      }
    }

    return connections;
  }

  /**
   * Get the currently active connection
   */
  public async getActiveConnection(): Promise<DevOpsConnection | null> {
    const connections = await this.getConnections();
    return connections.find((c) => c.isActive) || null;
  }

  /**
   * Validate that a DevOps URL is correct format (no network validation)
   */
  public validateUrl(url: string): { isValid: boolean; error?: string } {
    const result = parseDevOpsUrl(url);
    return {
      isValid: result.isValid,
      error: result.error,
    };
  }

  /**
   * Generate MCP server configuration for a DevOps connection
   */
  private generateServerConfig(organization: string, project: string): MCPServerConfig {
    return {
      command: "npx",
      args: ["-y", "@azure-devops/mcp", organization, project, "-d", ...AZURE_DEVOPS_MCP_DOMAINS],
    };
  }

  /**
   * Parse connection details from a server config
   */
  private parseConnectionFromServerConfig(
    serverName: string,
    serverConfig: MCPServerConfig,
    activeId: string | null
  ): DevOpsConnection | null {
    // Expected args format: ["-y", "@azure-devops/mcp", org, project, "-d", ...domains]
    if (!serverConfig.args || serverConfig.args.length < 4) {
      return null;
    }

    if (serverConfig.args[1] !== "@azure-devops/mcp") {
      return null;
    }

    const organization = serverConfig.args[2];
    const project = serverConfig.args[3];
    const id = generateConnectionId(organization, project);

    return {
      id,
      organization,
      project,
      isActive: activeId === id,
      serverName,
    };
  }

  /**
   * Add a server to workspace MCP config
   */
  private async addToWorkspaceMcpConfig(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    const configPath = this.getWorkspaceMcpConfigPath();
    let config = await this.readWorkspaceMcpConfig();

    if (!config.servers) {
      config.servers = {};
    }

    config.servers[serverName] = {
      ...serverConfig,
      type: "stdio",
    };

    await this.writeWorkspaceMcpConfig(config);
  }

  /**
   * Remove a server from workspace MCP config
   */
  private async removeFromWorkspaceMcpConfig(serverName: string): Promise<void> {
    const config = await this.readWorkspaceMcpConfig();

    if (config.servers && config.servers[serverName]) {
      delete config.servers[serverName];
      await this.writeWorkspaceMcpConfig(config);
    }
  }

  /**
   * Get workspace MCP config file path
   */
  private getWorkspaceMcpConfigPath(): string {
    const workspaceRoot = getWorkspaceRoot();
    return path.join(workspaceRoot, ".vscode", "mcp.json");
  }

  /**
   * Read workspace MCP configuration
   */
  private async readWorkspaceMcpConfig(): Promise<{ servers: Record<string, MCPServerConfig>; inputs?: any[] }> {
    try {
      const configPath = this.getWorkspaceMcpConfigPath();
      const content = await fs.promises.readFile(configPath, "utf8");
      return JSON.parse(content);
    } catch {
      return { servers: {} };
    }
  }

  /**
   * Write workspace MCP configuration
   */
  private async writeWorkspaceMcpConfig(config: { servers: Record<string, any>; inputs?: any[] }): Promise<void> {
    const configPath = this.getWorkspaceMcpConfigPath();
    const configDir = path.dirname(configPath);

    await fs.promises.mkdir(configDir, { recursive: true });
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, "\t"), "utf8");
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this._onConnectionsChanged.dispose();
  }
}
