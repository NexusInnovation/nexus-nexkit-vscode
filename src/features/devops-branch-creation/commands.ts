import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { Commands } from "../../shared/constants/commands";
import { registerCommand } from "../../shared/commands/commandRegistry";

/**
 * Register the command that creates (and checks out) a branch from an Azure DevOps work item.
 */
export function registerCreateBranchFromWorkItemCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.CREATE_BRANCH_FROM_WORK_ITEM,
    async () => {
      await services.devOpsBranchCreation.createBranchFromWorkItem("palette");
    },
    services.telemetry
  );
}
