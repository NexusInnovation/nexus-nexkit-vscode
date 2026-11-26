import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { BuildLogViewService } from "./buildLogViewService";

/**
 * Register the bottom-panel view that shows the log of a build job/step
 */
export function registerBuildLogView(context: vscode.ExtensionContext, services: ServiceContainer): void {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BuildLogViewService.VIEW_ID, services.devOpsBuildLog, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
}

/**
 * Register the command that opens the Azure DevOps builds panel in the editor area
 */
export function registerOpenDevOpsPipelinesCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.OPEN_DEVOPS_PIPELINES,
    async () => {
      services.devOpsPipelines.openPanel();
    },
    services.telemetry
  );
}
