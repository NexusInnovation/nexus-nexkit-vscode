import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { isSquadErr, SquadBacklogItem, SquadWorktreeCleanupCandidate } from "./models";

/** Register Squad feature commands. */
export function registerSquadExportCommand(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): void {
  registerCommand(
    context,
    Commands.EXPORT_SQUAD,
    async () => {
      const result = await services.squadExport.exportSquad();
      if (isSquadErr(result)) {
        const message = result.error.remediation
          ? `${result.error.message} ${result.error.remediation}`
          : result.error.message;
        await vscode.window.showErrorMessage(message);
        return;
      }

      await vscode.window.showInformationMessage("Squad export completed.");
    },
    services.telemetry
  );
}

export function registerSquadWorktreeCommands(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.CREATE_SQUAD_WORKTREE,
    async () => {
      const items = await services.squadWorktrees.listItems({ squadOnly: true, limit: 100 });
      if (isSquadErr(items)) {
        await vscode.window.showErrorMessage(formatSquadError(items.error));
        return;
      }
      const selected = await vscode.window.showQuickPick(
        items.value.map((item) => ({
          label: `#${item.number} ${item.title}`,
          description: item.providerId,
          item,
        })),
        { title: "Start work on a Squad backlog item" }
      );
      if (!selected) {
        return;
      }
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Creating Squad worktree", cancellable: true },
        (progress, token) =>
          services.squadWorktrees.create(
            {
              providerId: (selected.item as SquadBacklogItem).providerId,
              itemId: (selected.item as SquadBacklogItem).id,
            },
            progress,
            token
          )
      );
      if (isSquadErr(result)) {
        await vscode.window.showErrorMessage(formatSquadError(result.error));
        return;
      }
      const dependencyFailure = result.value.dependencies.error;
      if (dependencyFailure) {
        await vscode.window.showWarningMessage(`Squad worktree created, but dependencies failed: ${dependencyFailure.message}`);
        return;
      }
      await vscode.window.showInformationMessage("Squad worktree ready.");
    },
    services.telemetry
  );

  registerCommand(
    context,
    Commands.CLEANUP_SQUAD_WORKTREES,
    async () => {
      const candidates = await services.squadWorktrees.findCleanupCandidates();
      if (isSquadErr(candidates)) {
        await vscode.window.showErrorMessage(formatSquadError(candidates.error));
        return;
      }
      const selected = await vscode.window.showQuickPick(
        candidates.value.map((candidate) => ({
          label: candidate.worktree.branch ?? candidate.worktree.id,
          description: candidate.reasons.join(", ") || candidate.blockers.join(", "),
          candidate,
        })),
        { title: "Clean up Squad worktrees" }
      );
      if (!selected) {
        return;
      }
      const candidate = (selected as { candidate: SquadWorktreeCleanupCandidate }).candidate;
      const discardChanges = candidate.blockers.includes("dirty");
      if (discardChanges) {
        const answer = await vscode.window.showWarningMessage(
          "This worktree has uncommitted changes. NexKit will stash them before cleanup. Continue?",
          { modal: true },
          "Stash and clean up"
        );
        if (answer !== "Stash and clean up") {
          return;
        }
      }
      const result = await services.squadWorktrees.cleanup({
        worktreeId: candidate.worktree.id,
        deleteBranch: true,
        discardChanges,
      });
      if (isSquadErr(result)) {
        await vscode.window.showErrorMessage(formatSquadError(result.error));
        return;
      }
      if (!result.value.removed) {
        await vscode.window.showErrorMessage("Squad worktree cleanup failed.");
        return;
      }
      await vscode.window.showInformationMessage("Squad worktree cleaned up.");
    },
    services.telemetry
  );
}

function formatSquadError(error: { message: string; remediation?: string }): string {
  return error.remediation ? `${error.message} ${error.remediation}` : error.message;
}
