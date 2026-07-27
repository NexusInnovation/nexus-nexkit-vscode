import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import {
  RepositorySyncConflictActionGroup,
  RepositorySyncActionType,
  RepositorySyncPullResult,
  RepositorySyncRunResult,
} from "./models/repositorySyncModels";

interface RepositoryCandidate {
  name: string;
  path: string;
  outcomeKind: string;
  reason?: string;
}

type ConflictSelection =
  | { kind: "single"; action: RepositorySyncActionType }
  | { kind: "batch"; action: RepositorySyncActionType; group: RepositorySyncConflictActionGroup };

let _lastRunResult: RepositorySyncRunResult | undefined;

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

export function registerRetrySpecificRepositorySyncCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.REPOSITORY_SYNC_RETRY_SPECIFIC,
    async (input?: string | { repositoryPath?: string; repositoryName?: string }) => {
      const candidate = await resolveRetrySpecificCandidate(input);
      if (!candidate) {
        vscode.window.showInformationMessage("No conflict/failure repository available to retry from the latest sync run.");
        return;
      }

      await runRepositorySync(
        {
          interactiveTrust: true,
          repositoryPath: candidate.path,
          triggerReason: "manual-retry-specific-command",
        },
        services,
        `Retry specific sync finished (${candidate.name})`
      );
    },
    services.telemetry
  );
}

export function registerApplyBatchConflictActionCommand(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): void {
  registerCommand(
    context,
    Commands.REPOSITORY_SYNC_APPLY_BATCH_CONFLICT_ACTION,
    async (input?: {
      conflictGroup?: RepositorySyncConflictActionGroup;
      action?: RepositorySyncActionType;
    }) => {
      if (!_lastRunResult) {
        vscode.window.showInformationMessage("No repository sync run available yet. Run repository sync first.");
        return;
      }

      const conflictGroup = input?.conflictGroup ?? (await promptConflictGroup(_lastRunResult));
      if (!conflictGroup) {
        return;
      }

      const action = input?.action ?? (await promptBatchActionForGroup(conflictGroup, _lastRunResult));
      if (!action) {
        return;
      }

      await applyBatchConflictAction(action, conflictGroup, _lastRunResult, services, "manual-batch-conflict-action");
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
  options: { retryFailedOnly?: boolean; interactiveTrust?: boolean; repositoryPath?: string; triggerReason: string },
  services: ServiceContainer,
  completionTitle: string
): Promise<void> {
  services.repositorySyncOutput.appendLine(`[Repository Sync] Starting run (${options.triggerReason})...`);
  services.repositorySyncStatusBar.setRunning();

  const result = await services.repositorySyncScheduler.runSync(options);
  _lastRunResult = result;
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

  const handledGroups = new Set<RepositorySyncConflictActionGroup>();

  for (const conflict of conflictResults) {
    const conflictGroup = conflict.outcome.conflictActionGroup;
    if (conflictGroup && handledGroups.has(conflictGroup)) {
      continue;
    }

    const conflictActions = conflict.outcome.actions ?? [];
    const selection = await selectConflictAction(conflict, conflictActions, conflictResults);
    if (!selection) {
      continue;
    }

    if (selection.kind === "batch") {
      await applyBatchConflictAction(selection.action, selection.group, runResult, services, triggerReason);
      handledGroups.add(selection.group);
      continue;
    }

    await executeConflictAction(selection.action, conflict, services, triggerReason);
  }
}

async function selectConflictAction(
  conflict: RepositorySyncPullResult,
  actions: RepositorySyncActionType[],
  conflictResults: RepositorySyncPullResult[]
): Promise<ConflictSelection | undefined> {
  if (actions.length === 0) {
    return undefined;
  }

  const conflictGroup = conflict.outcome.conflictActionGroup;
  const sameGroupCount =
    conflictGroup === undefined
      ? 0
      : conflictResults.filter((result) => result.outcome.conflictActionGroup === conflictGroup).length;

  type ActionItem = {
    label: string;
    detail: string;
    action: RepositorySyncActionType;
    applyToGroup: boolean;
  };

  const actionItems: ActionItem[] = actions.map((action) => ({
    label: formatActionLabel(action),
    detail: action,
    action,
    applyToGroup: false,
  }));

  if (conflictGroup && sameGroupCount > 1) {
    const batchItems = actions.map((action) => ({
      label: `Apply to all (${sameGroupCount}) - ${formatActionLabel(action)}`,
      detail: `batch:${action}`,
      action,
      applyToGroup: true,
    }));
    actionItems.push(...batchItems);
  }

  const selection = await vscode.window.showQuickPick(actionItems, {
    placeHolder: `Conflict action for ${conflict.repository.name}: ${conflict.outcome.reason ?? "conflict-risk"}`,
    ignoreFocusOut: true,
  });

  if (!selection) {
    return undefined;
  }

  if (selection.applyToGroup && conflictGroup) {
    return {
      kind: "batch",
      action: selection.action,
      group: conflictGroup,
    };
  }

  return {
    kind: "single",
    action: selection.action,
  };
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
    _lastRunResult = retryResult;
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
    _lastRunResult = retryFailedResult;
    services.repositorySyncStatusBar.updateLastRun(retryFailedResult, `${triggerReason}-retry-failed-only`);
    logRunSummary(retryFailedResult, services);
    return;
  }

  services.repositorySyncOutput.appendLine(
    `[Repository Sync] Action: ignore ${conflict.repository.name} (${conflict.repository.path})`
  );
}

async function applyBatchConflictAction(
  action: RepositorySyncActionType,
  conflictGroup: RepositorySyncConflictActionGroup,
  runResult: RepositorySyncRunResult,
  services: ServiceContainer,
  triggerReason: string
): Promise<void> {
  const groupedConflicts = runResult.results.filter(
    (result) => result.outcome.kind === "conflict-risk" && result.outcome.conflictActionGroup === conflictGroup
  );
  if (groupedConflicts.length === 0) {
    vscode.window.showInformationMessage(`No repositories found for conflict group: ${conflictGroup}`);
    return;
  }

  services.repositorySyncOutput.appendLine(
    `[Repository Sync] Batch action: ${action} for ${groupedConflicts.length} repos in ${conflictGroup}`
  );

  if (action === "open-workspace-scm") {
    await vscode.commands.executeCommand("workbench.view.scm");
    return;
  }

  if (action === "open-external-repo") {
    for (const conflict of groupedConflicts) {
      await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(conflict.repository.path), true);
    }
    return;
  }

  if (action === "ignore") {
    for (const conflict of groupedConflicts) {
      services.repositorySyncOutput.appendLine(
        `[Repository Sync] Batch ignore: ${conflict.repository.name} (${conflict.repository.path})`
      );
    }
    return;
  }

  if (action === "retry-failed-only") {
    services.repositorySyncStatusBar.setRunning();
    const retryFailedResult = await services.repositorySyncScheduler.runSync({
      retryFailedOnly: true,
      interactiveTrust: true,
      triggerReason: `${triggerReason}-batch-retry-failed-only`,
    });
    _lastRunResult = retryFailedResult;
    services.repositorySyncStatusBar.updateLastRun(retryFailedResult, `${triggerReason}-batch-retry-failed-only`);
    logRunSummary(retryFailedResult, services);
    return;
  }

  if (action === "retry") {
    for (const conflict of groupedConflicts) {
      services.repositorySyncStatusBar.setRunning();
      const retryResult = await services.repositorySyncScheduler.runSync({
        interactiveTrust: true,
        repositoryPath: conflict.repository.path,
        triggerReason: `${triggerReason}-batch-retry-specific`,
      });
      _lastRunResult = retryResult;
      services.repositorySyncStatusBar.updateLastRun(retryResult, `${triggerReason}-batch-retry-specific`);
      logRunSummary(retryResult, services);
    }
  }
}

function extractLatestRepositoryCandidates(): RepositoryCandidate[] {
  if (!_lastRunResult) {
    return [];
  }

  return _lastRunResult.results
    .filter((result) => result.outcome.kind === "failed" || result.outcome.kind === "conflict-risk")
    .map((result) => ({
      name: result.repository.name,
      path: result.repository.path,
      outcomeKind: result.outcome.kind,
      reason: result.reason ?? result.outcome.reason,
    }));
}

async function resolveRetrySpecificCandidate(
  input?: string | { repositoryPath?: string; repositoryName?: string }
): Promise<RepositoryCandidate | undefined> {
  const candidates = extractLatestRepositoryCandidates();
  if (candidates.length === 0) {
    return undefined;
  }

  const requestedPath =
    typeof input === "string" ? input : input?.repositoryPath;
  if (requestedPath) {
    return candidates.find((candidate) => candidate.path === requestedPath);
  }

  const requestedName = typeof input === "object" ? input.repositoryName : undefined;
  if (requestedName) {
    return candidates.find((candidate) => candidate.name === requestedName);
  }

  const selection = await vscode.window.showQuickPick(
    candidates.map((candidate) => ({
      label: candidate.name,
      description: `${candidate.outcomeKind}${candidate.reason ? ` - ${candidate.reason}` : ""}`,
      detail: candidate.path,
      candidate,
    })),
    {
      placeHolder: "Select a repository to retry from latest conflicts/failures",
      ignoreFocusOut: true,
    }
  );

  return selection?.candidate;
}

async function promptConflictGroup(
  runResult: RepositorySyncRunResult
): Promise<RepositorySyncConflictActionGroup | undefined> {
  const groups = new Map<RepositorySyncConflictActionGroup, number>();
  for (const result of runResult.results) {
    const group = result.outcome.conflictActionGroup;
    if (result.outcome.kind !== "conflict-risk" || !group) {
      continue;
    }

    groups.set(group, (groups.get(group) ?? 0) + 1);
  }

  if (groups.size === 0) {
    vscode.window.showInformationMessage("No conflict groups available in the latest repository sync run.");
    return undefined;
  }

  const selection = await vscode.window.showQuickPick(
    Array.from(groups.entries()).map(([group, count]) => ({
      label: group,
      description: `${count} repository conflict(s)`,
      group,
    })),
    {
      placeHolder: "Select conflict group to handle in batch",
      ignoreFocusOut: true,
    }
  );

  return selection?.group;
}

async function promptBatchActionForGroup(
  conflictGroup: RepositorySyncConflictActionGroup,
  runResult: RepositorySyncRunResult
): Promise<RepositorySyncActionType | undefined> {
  const firstMatchingConflict = runResult.results.find(
    (result) => result.outcome.kind === "conflict-risk" && result.outcome.conflictActionGroup === conflictGroup
  );
  const actions = firstMatchingConflict?.outcome.actions ?? [];
  if (actions.length === 0) {
    return undefined;
  }

  const selection = await vscode.window.showQuickPick(
    actions.map((action) => ({
      label: formatActionLabel(action),
      detail: action,
      action,
    })),
    {
      placeHolder: `Select batch action for ${conflictGroup}`,
      ignoreFocusOut: true,
    }
  );

  return selection?.action;
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
