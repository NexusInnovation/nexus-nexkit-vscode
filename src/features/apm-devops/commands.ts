import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { Commands } from "../../shared/constants/commands";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { parseDevOpsUrl } from "./devOpsUrlParser";

/**
 * Register command to add a DevOps connection via command palette
 */
export function registerAddDevOpsConnectionCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.ADD_DEVOPS_CONNECTION,
    async () => {
      // Prompt for URL
      const url = await vscode.window.showInputBox({
        prompt: "Enter Azure DevOps project URL",
        placeHolder: "https://dev.azure.com/organization/project",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "URL is required";
          }
          const result = parseDevOpsUrl(value.trim());
          if (!result.isValid) {
            return result.error;
          }
          return undefined;
        },
      });

      if (!url) {
        return;
      }

      try {
        const connection = await services.devOpsConfig.addConnection(url.trim());
        vscode.window.showInformationMessage(
          `Added Azure DevOps connection: ${connection.organization}/${connection.project}`
        );

        services.telemetry.trackEvent("devops.connection.added", {
          organization: connection.organization,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to add connection: ${message}`);
        services.telemetry.trackError(error instanceof Error ? error : new Error(message), {
          context: "addDevOpsConnection",
        });
      }
    },
    services.telemetry
  );
}

/**
 * Register command to remove a DevOps connection via command palette
 */
export function registerRemoveDevOpsConnectionCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.REMOVE_DEVOPS_CONNECTION,
    async () => {
      // Get all connections
      const connections = await services.devOpsConfig.getConnections();

      if (connections.length === 0) {
        vscode.window.showInformationMessage("No Azure DevOps connections configured");
        return;
      }

      // Build quick pick items
      const items = connections.map((conn) => ({
        label: `${conn.organization}/${conn.project}`,
        description: conn.isActive ? "Active" : undefined,
        connection: conn,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a connection to remove",
        title: "Remove Azure DevOps Connection",
      });

      if (!selected) {
        return;
      }

      // Confirm removal
      const confirm = await vscode.window.showWarningMessage(
        `Remove connection "${selected.label}"? This will remove the MCP configuration.`,
        "Remove",
        "Cancel"
      );

      if (confirm !== "Remove") {
        return;
      }

      try {
        await services.devOpsConfig.removeConnection(selected.connection.id);
        vscode.window.showInformationMessage(`Removed Azure DevOps connection: ${selected.label}`);

        services.telemetry.trackEvent("devops.connection.removed", {
          organization: selected.connection.organization,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to remove connection: ${message}`);
        services.telemetry.trackError(error instanceof Error ? error : new Error(message), {
          context: "removeDevOpsConnection",
        });
      }
    },
    services.telemetry
  );
}
