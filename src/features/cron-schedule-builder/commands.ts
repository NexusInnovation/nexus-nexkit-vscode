import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

/**
 * Registers the command that opens the standalone Cron Schedule Builder panel.
 */
export function registerOpenCronScheduleBuilderCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.OPEN_CRON_SCHEDULE_BUILDER,
    async () => {
      services.cronScheduleBuilder.openPanel();
    },
    services.telemetry
  );
}
