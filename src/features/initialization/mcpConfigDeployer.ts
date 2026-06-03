import * as fs from "fs";
import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";
import { ConfirmationService } from "../../shared/services/confirmationService";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Service to deploy MCP configuration in a workspace
 */
export class MCPConfigDeployer {
  public static readonly AzureDevopsServerName = "azureDevOps";

  constructor(private readonly _confirmation: ConfirmationService) {}

  /**
   * Deploy workspace MCP configuration for project initialization.
   * NON-DESTRUCTIVE: Merges with existing configuration.
   * Prompts for confirmation before writing; skips if refused.
   */
  public async deployWorkspaceMCPServers(targetRoot: string): Promise<void> {
    const result = await this._confirmation.confirm(
      `Nexkit wants to add the "${MCPConfigDeployer.AzureDevopsServerName}" MCP server to your workspace`,
      `This will add the azureDevOps MCP server to .vscode/mcp.json in this workspace so it is available for Azure DevOps integration.`,
      SettingsManager.CONFIRMATION_KEYS.mcpWorkspaceServer(MCPConfigDeployer.AzureDevopsServerName)
    );

    if (result !== "accepted") {
      return;
    }

    const mcpConfigPath = path.join(targetRoot, ".vscode", "mcp.json");
    const mcpDir = path.dirname(mcpConfigPath);

    await fs.promises.mkdir(mcpDir, { recursive: true });

    // Read existing config or start fresh
    let config: any = { servers: {} };
    if (await fileExists(mcpConfigPath)) {
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

    const mcpServers = [MCPConfigDeployer.AzureDevopsServerName];

    // Add Azure DevOps MCP if selected
    if (mcpServers.includes(MCPConfigDeployer.AzureDevopsServerName)) {
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
      if (serverName !== MCPConfigDeployer.AzureDevopsServerName) {
        // Handle other server types in the future
        console.log(`MCP server ${serverName} not yet implemented`);
      }
    }

    await fs.promises.writeFile(mcpConfigPath, JSON.stringify(config, null, 2), "utf8");
  }
}
