import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import {
  RepositorySyncActionType,
  RepositorySyncPullResult,
  RepositorySyncRunResult,
} from "./models/repositorySyncModels";

export function registerRunRepositorySyncCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.REPOSITORY_SYNC_RUN_ONCE,
    async () => {
      const retryFailedOnlyChoice = "Retry Failed Only";
      const fullRunChoice = "Run Full Sync";

      const selection = await vscode.window.showQuickPick([fullRunChoice, retryFailedOnlyChoice], {
        placeHolder: "Choose repository sync mode",
        ignoreFocusOut: true,
      });

      if (!selection) {
        return;
      }

      const triggerReason = selection === retryFailedOnlyChoice ? "manual-retry-failed" : "manual-full-sync";
      await runRepositorySync(
        {
          retryFailedOnly: selection === retryFailedOnlyChoice,
          interactiveTrust: true,
          triggerReason,
        },
        services,
        "Repository sync finished"
      );
    },
    services.telemetry
  );
}

export function registerRetryFailedRepositorySyncCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.REPOSITORY_SYNC_RETRY_FAILED_ONLY,
    async () => {
      await runRepositorySync(
        {
          retryFailedOnly: true,
          interactiveTrust: true,
          triggerReason: "manual-retry-failed-command",
        },
        services,
        "Retry failed sync finished"
      );
    },
    services.telemetry
  );
}

export function registerShowRepositorySyncOutputCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.REPOSITORY_SYNC_SHOW_OUTPUT,
    async () => {
      services.repositorySyncOutput.show();
    },
    services.telemetry
  );
}

export function registerToggleRepositorySyncCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.REPOSITORY_SYNC_TOGGLE,
    async () => {
      const enabled = SettingsManager.isRepoSyncEnabled();
      await SettingsManager.setRepoSyncEnabled(!enabled);

      if (!enabled) {
        services.repositorySyncScheduler.start();
        if (SettingsManager.isRepoSyncStatusBarEnabled()) {
          services.repositorySyncStatusBar.show();
        }
      } else {
        services.repositorySyncScheduler.stop();
        services.repositorySyncStatusBar.hide();
      }

      vscode.window.showInformationMessage(`Nexkit repository sync ${enabled ? "disabled" : "enabled"}.`);
    },
    services.telemetry
  );
}

async function runRepositorySync(
  options: { retryFailedOnly?: boolean; interactiveTrust?: boolean; triggerReason: string },
  services: ServiceContainer,
  completionTitle: string
): Promise<void> {
  services.repositorySyncOutput.appendLine(`[Repository Sync] Starting run (${options.triggerReason})...`);
  services.repositorySyncStatusBar.setRunning();

  const result = await services.repositorySyncScheduler.runSync(options);
  services.repositorySyncStatusBar.updateLastRun(result, options.triggerReason);

  await handleConflictActions(result, services, options.triggerReason);
  logRunSummary(result, services);

  const summary = result.summary;
  vscode.window.showInformationMessage(
    `${completionTitle}: ${summary.successReady} ready, ${summary.skipped} skipped, ` +
      `${summary.conflictRisk} warnings, ${summary.failed} failed.`
  );
}

async function handleConflictActions(
  runResult: RepositorySyncRunResult,
  services: ServiceContainer,
  triggerReason: string
): Promise<void> {
  const conflictResults = runResult.results.filter((result) => result.outcome.kind === "conflict-risk");
  if (conflictResults.length === 0) {
    return;
  }

  for (const conflict of conflictResults) {
    const conflictActions = conflict.outcome.actions ?? [];
    const selectedAction = await selectConflictAction(conflict, conflictActions);
    if (!selectedAction) {
      continue;
    }

    await executeConflictAction(selectedAction, conflict, services, triggerReason);
  }
}

async function selectConflictAction(
  conflict: RepositorySyncPullResult,
  actions: RepositorySyncActionType[]
): Promise<RepositorySyncActionType | undefined> {
  if (actions.length === 0) {
    return undefined;
  }

  const actionItems = actions.map((action) => ({
    label: formatActionLabel(action),
    detail: action,
    action,
  }));

  const selection = await vscode.window.showQuickPick(actionItems, {
    placeHolder: `Conflict action for ${conflict.repository.name}: ${conflict.outcome.reason ?? "conflict-risk"}`,
    ignoreFocusOut: true,
  });

  return selection?.action;
}

function formatActionLabel(action: RepositorySyncActionType): string {
  if (action === "open-workspace-scm") {
    return "Open Source Control";
  }
  if (action === "open-external-repo") {
    return "Open External Repository";
  }
  if (action === "retry-failed-only") {
    return "Retry Failed Only";
  }
  if (action === "retry") {
    return "Retry This Repository";
  }
  return "Ignore";
}

async function executeConflictAction(
  action: RepositorySyncActionType,
  conflict: RepositorySyncPullResult,
  services: ServiceContainer,
  triggerReason: string
): Promise<void> {
  if (action === "open-workspace-scm") {
    services.repositorySyncOutput.appendLine(
      `[Repository Sync] Action: open-workspace-scm for ${conflict.repository.name} (${conflict.repository.path})`
    );
    await vscode.commands.executeCommand("workbench.view.scm");
    return;
  }

  if (action === "open-external-repo") {
    services.repositorySyncOutput.appendLine(
      `[Repository Sync] Action: open-external-repo for ${conflict.repository.name} (${conflict.repository.path})`
    );
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(conflict.repository.path), true);
    return;
  }

  if (action === "retry") {
    services.repositorySyncOutput.appendLine(
      `[Repository Sync] Action: retry repository ${conflict.repository.name} (${conflict.repository.path})`
    );
    services.repositorySyncStatusBar.setRunning();
    const retryResult = await services.repositorySyncScheduler.runSync({
      interactiveTrust: true,
      repositoryPath: conflict.repository.path,
      triggerReason: `${triggerReason}-retry-specific`,
    });
    services.repositorySyncStatusBar.updateLastRun(retryResult, `${triggerReason}-retry-specific`);
    logRunSummary(retryResult, services);
    return;
  }

  if (action === "retry-failed-only") {
    services.repositorySyncOutput.appendLine("[Repository Sync] Action: retry-failed-only");
    services.repositorySyncStatusBar.setRunning();
    const retryFailedResult = await services.repositorySyncScheduler.runSync({
      retryFailedOnly: true,
      interactiveTrust: true,
      triggerReason: `${triggerReason}-retry-failed-only`,
    });
    services.repositorySyncStatusBar.updateLastRun(retryFailedResult, `${triggerReason}-retry-failed-only`);
    logRunSummary(retryFailedResult, services);
    return;
  }

  services.repositorySyncOutput.appendLine(
    `[Repository Sync] Action: ignore ${conflict.repository.name} (${conflict.repository.path})`
  );
}

function logRunSummary(runResult: RepositorySyncRunResult, services: ServiceContainer): void {
  const summary = runResult.summary;
  const lines: string[] = [
    "",
    "=== Repository Sync Summary ===",
    `Processed: ${runResult.processedCount}/${runResult.plannedCount} planned (discovered ${runResult.repositoryCount})`,
    `Totals: ready=${summary.successReady}, skipped=${summary.skipped}, conflict-risk=${summary.conflictRisk}, failed=${summary.failed}, changed=${summary.changed}`,
  ];

  if (summary.conflictRisk > 0) {
    lines.push(
      "Next actions:",
      `- Use ${Commands.REPOSITORY_SYNC_RETRY_FAILED_ONLY} to retry failed-only runs`,
      "- For workspace conflicts, choose action 'open-workspace-scm'",
      "- For external conflicts, choose action 'open-external-repo', 'ignore', or 'retry'",
      `- Open output anytime with ${Commands.REPOSITORY_SYNC_SHOW_OUTPUT}`
    );
  } else if (summary.failed > 0) {
    lines.push(
      "Next actions:",
      `- Retry failed-only with ${Commands.REPOSITORY_SYNC_RETRY_FAILED_ONLY}`,
      `- Inspect details in ${Commands.REPOSITORY_SYNC_SHOW_OUTPUT}`
    );
  } else {
    lines.push("Next actions: none required.");
  }

  services.repositorySyncOutput.appendBlock(lines);
}
