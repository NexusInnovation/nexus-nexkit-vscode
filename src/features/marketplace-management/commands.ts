import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { NEXUS_PLUGIN_MARKETPLACE } from "./models/marketplace";

/**
 * Register the command that connects the Nexus plugin marketplace
 */
export function registerAddNexusMarketplaceCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.ADD_NEXUS_MARKETPLACE,
    async () => {
      await services.marketplace.add(NEXUS_PLUGIN_MARKETPLACE);
      const selection = await vscode.window.showInformationMessage(
        "The Nexus plugin marketplace is connected. Browse its plugins to install agents, skills, prompts and instructions.",
        "Browse Plugins"
      );
      if (selection === "Browse Plugins") {
        await vscode.commands.executeCommand("workbench.agentPlugins.browse");
      }
    },
    services.telemetry
  );
}
