import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { DevOpsConnection, AZURE_DEVOPS_MCP_DOMAINS } from "./models/devOpsConnection";
import { parseDevOpsUrl, generateConnectionId } from "./devOpsUrlParser";
import { MCPServerConfig } from "../mcp-management/mcpConfigService";
import { getWorkspaceRoot } from "../../shared/utils/fileHelper";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Delay before reloading window to ensure UI message is visible (ms)
 */
const RELOAD_DELAY_MS = 500;

/**
 * Standard MCP server name for Azure DevOps
 * Agents should reference this name to work with any active project
 */
const AZURE_DEVOPS_MCP_NAME = "azure-devops";

/**
 * Stored connection data (without runtime properties like serverName)
 */
interface StoredConnection {
  id: string;
  organization: string;
  project: string;
}

/**
 * Service for managing Azure DevOps MCP configurations
 * - Stores connections list in workspace state
 * - Only active connection appears in MCP config with standard name "azure-devops"
 * - Agents always reference "azure-devops" MCP regardless of which project is active
 */
export class DevOpsMcpConfigService {
  private readonly _onConnectionsChanged = new vscode.EventEmitter<void>();
  public readonly onConnectionsChanged = this._onConnectionsChanged.event;

  /**
   * Add a DevOps connection from a URL
   * New connections automatically become active
   * @param url Azure DevOps project URL
   * @returns The created connection
   */
  public async addConnection(url: string): Promise<DevOpsConnection> {
    const parseResult = parseDevOpsUrl(url);

    if (!parseResult.isValid || !parseResult.organization || !parseResult.project) {
      throw new Error(parseResult.error || "Invalid DevOps URL");
    }

    const { organization, project } = parseResult;
    const id = generateConnectionId(organization, project);

    // Check if connection already exists
    const existingConnections = this.getStoredConnections();
    if (existingConnections.some((c) => c.id === id)) {
      throw new Error(`Connection for ${organization}/${project} already exists`);
    }

    // Add to stored connections
    const newConnection: StoredConnection = { id, organization, project };
    await SettingsManager.setDevOpsConnectionsList([...existingConnections, newConnection]);

    // Auto-activate new connection (update MCP config)
    await this.activateConnection(id, organization, project);

    this._onConnectionsChanged.fire();

    return {
      id,
      organization,
      project,
      isActive: true,
      serverName: AZURE_DEVOPS_MCP_NAME,
    };
  }

  /**
   * Remove a DevOps connection
   * @param connectionId The connection ID to remove
   */
  public async removeConnection(connectionId: string): Promise<void> {
    const connections = this.getStoredConnections();
    const connection = connections.find((c) => c.id === connectionId);

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Remove from stored connections
    const updatedConnections = connections.filter((c) => c.id !== connectionId);
    await SettingsManager.setDevOpsConnectionsList(updatedConnections);

    // If this was the active connection, handle MCP update
    const activeId = SettingsManager.getActiveDevOpsConnection();
    if (activeId === connectionId) {
      // Remove from MCP config
      await this.removeFromWorkspaceMcpConfig(AZURE_DEVOPS_MCP_NAME);

      // Activate another connection if available
      if (updatedConnections.length > 0) {
        const nextConnection = updatedConnections[0];
        await this.activateConnection(nextConnection.id, nextConnection.organization, nextConnection.project);
      } else {
        await SettingsManager.setActiveDevOpsConnection(null);
      }
    }

    this._onConnectionsChanged.fire();
  }

  /**
   * Set a connection as active
   * Updates the MCP config with the selected project
   * @param connectionId The connection ID to activate
   */
  public async setActiveConnection(connectionId: string): Promise<void> {
    const connections = this.getStoredConnections();
    const connection = connections.find((c) => c.id === connectionId);

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    await this.activateConnection(connection.id, connection.organization, connection.project);
    this._onConnectionsChanged.fire();
  }

  /**
   * Get all configured DevOps connections
   */
  public async getConnections(): Promise<DevOpsConnection[]> {
    const storedConnections = this.getStoredConnections();
    const activeId = SettingsManager.getActiveDevOpsConnection();

    return storedConnections.map((c) => ({
      id: c.id,
      organization: c.organization,
      project: c.project,
      isActive: c.id === activeId,
      serverName: c.id === activeId ? AZURE_DEVOPS_MCP_NAME : "",
    }));
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
   * Activate a connection - updates MCP config with standard name
   */
  private async activateConnection(id: string, organization: string, project: string): Promise<void> {
    // Update the MCP config with the active project using standard name
    const serverConfig = this.generateServerConfig(organization, project);
    await this.addToWorkspaceMcpConfig(AZURE_DEVOPS_MCP_NAME, serverConfig);
    await SettingsManager.setActiveDevOpsConnection(id);

    // Reload window to apply MCP changes
    this.reloadWindowForMcpChange(organization, project);
  }

  /**
   * Reload window to apply MCP configuration changes
   */
  private reloadWindowForMcpChange(organization: string, project: string): void {
    vscode.window.showInformationMessage(`Active DevOps project changed to ${organization}/${project}. Reloading window...`);
    // Small delay to ensure the message is visible
    setTimeout(() => {
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    }, RELOAD_DELAY_MS);
  }

  /**
   * Get stored connections from workspace state
   */
  private getStoredConnections(): StoredConnection[] {
    return SettingsManager.getDevOpsConnectionsList<StoredConnection>();
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
