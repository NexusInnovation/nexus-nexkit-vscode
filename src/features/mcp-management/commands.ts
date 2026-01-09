import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { MCPConfigService } from "./mcpConfigService";
import { Commands } from "../../shared/constants/commands";

/**
 * Register MCP management commands
 */
export function registerInstallUserMCPsCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.INSTALL_USER_MCPS,
    async () => {
      const { missing } = await services.mcpConfig.checkRequiredUserMCPs();

      if (missing.length === 0) {
        vscode.window.showInformationMessage("All required MCP servers are already configured!");
        return;
      }

      // Install missing servers
      for (const server of missing) {
        if (server === MCPConfigService.Context7ServerName) {
          await services.mcpConfig.addUserMCPServer(MCPConfigService.Context7ServerName, {
            command: "npx",
            args: ["-y", "@upstash/context7-mcp"],
          });
        } else if (server === MCPConfigService.SequentialThinkingServerName) {
          await services.mcpConfig.addUserMCPServer(MCPConfigService.SequentialThinkingServerName, {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
          });
        }
      }

      vscode.window
        .showInformationMessage(
          "User MCP servers installed successfully! Please reload VS Code for changes to take effect.",
          "Reload Now"
        )
        .then((selection) => {
          if (selection === "Reload Now") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
    },
    services.telemetry
  );
}
