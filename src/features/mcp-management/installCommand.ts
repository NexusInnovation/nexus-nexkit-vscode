import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";

/**
 * Register MCP management commands
 */
export function registerMcpCommands(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    "nexus-nexkit-vscode.installUserMCPs",
    async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Installing user MCP servers...",
          cancellable: false,
        },
        async (progress) => {
          progress.report({
            increment: 25,
            message: "Checking existing configuration...",
          });

          // Check what's already configured
          const { configured, missing } = await services.mcpConfig.checkRequiredUserMCPs();

          if (missing.length === 0) {
            vscode.window.showInformationMessage("All required MCP servers are already configured!");
            return;
          }

          progress.report({
            increment: 50,
            message: `Installing ${missing.join(", ")}...`,
          });

          // Install missing servers
          for (const server of missing) {
            if (server === "context7") {
              await services.mcpConfig.addUserMCPServer("context7", {
                command: "npx",
                args: ["-y", "@upstash/context7-mcp"],
              });
            } else if (server === "sequential-thinking") {
              await services.mcpConfig.addUserMCPServer("sequential-thinking", {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
              });
            }
          }

          progress.report({
            increment: 25,
            message: "Installation complete",
          });
        }
      );

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
