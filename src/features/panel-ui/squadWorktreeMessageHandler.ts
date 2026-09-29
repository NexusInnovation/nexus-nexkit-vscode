import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { ExtensionMessage, SquadWorktreeOperation, WebviewMessage } from "./types/webviewMessages";
import { isSquadErr, SquadError, SquadWorktreeCleanupCandidate, SquadWorktreeCleanupRequest } from "../squad/models";

/**
 * Routes Squad worktree-per-issue webview actions to the host service.
 *
 * The webview sends only backlog/worktree identifiers and options. The service
 * owns every path lookup and all destructive safety checks.
 */
export class SquadWorktreeMessageHandler {
  constructor(
    private readonly _services: ServiceContainer,
    private readonly _postMessage: (message: ExtensionMessage) => void,
    private readonly _now: () => number = () => Date.now()
  ) {}

  public async handle(message: WebviewMessage): Promise<boolean> {
    switch (message.command) {
      case "listSquadBacklogItems":
        await this._handleListBacklogItems(message);
        return true;
      case "getSquadWorktrees":
        await this._handleGetWorktrees();
        return true;
      case "previewSquadWorktree":
        await this._handlePreview(message);
        return true;
      case "createSquadWorktree":
        await this._handleCreate(message);
        return true;
      case "openSquadWorktree":
        await this._handleOpen(message);
        return true;
      case "findSquadWorktreeCleanup":
        await this._handleFindCleanup();
        return true;
      case "cleanupSquadWorktree":
        await this._handleCleanup(message);
        return true;
      case "retrySquadWorktreeDependencies":
        await this._handleRetryDependencies(message);
        return true;
      default:
        return false;
    }
  }

  private async _handleListBacklogItems(message: Extract<WebviewMessage, { command: "listSquadBacklogItems" }>): Promise<void> {
    this._start("listItems");
    const result = await this._services.squadWorktrees.listItems(message.query ?? { squadOnly: true, limit: 50 });
    if (isSquadErr(result)) {
      this._emitError(result.error);
      return;
    }
    this._postMessage({ command: "squadBacklogItemsUpdate", items: result.value, fetchedAt: this._now() });
  }

  private async _handleGetWorktrees(): Promise<void> {
    this._start("list");
    await this._sendWorktrees();
  }

  private async _handlePreview(message: Extract<WebviewMessage, { command: "previewSquadWorktree" }>): Promise<void> {
    this._start("preview");
    const result = await this._services.squadWorktrees.previewCreate(message.request);
    if (isSquadErr(result)) {
      this._emitError(result.error);
      return;
    }
    this._postMessage({ command: "squadWorktreePreview", preview: result.value });
  }

  private async _handleCreate(message: Extract<WebviewMessage, { command: "createSquadWorktree" }>): Promise<void> {
    this._start("create");
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Creating Squad worktree", cancellable: true },
      (progress, token) => this._services.squadWorktrees.create(message.request, progress, token)
    );
    if (isSquadErr(result)) {
      this._emitError(result.error);
      return;
    }
    this._postMessage({ command: "squadWorktreeCreated", outcome: result.value });
    await this._sendWorktrees();
  }

  private async _handleOpen(message: Extract<WebviewMessage, { command: "openSquadWorktree" }>): Promise<void> {
    this._start("open");
    const result = await this._services.squadWorktrees.open(message.worktreeId, { newWindow: message.newWindow });
    if (isSquadErr(result)) {
      this._emitError(result.error);
      return;
    }
    this._postMessage({ command: "squadWorktreeOpened", worktreeId: message.worktreeId });
  }

  private async _handleFindCleanup(): Promise<void> {
    this._start("findCleanup");
    const result = await this._services.squadWorktrees.findCleanupCandidates();
    if (isSquadErr(result)) {
      this._emitError(result.error);
      return;
    }
    this._postMessage({ command: "squadWorktreeCleanupCandidates", candidates: result.value });
  }

  private async _handleCleanup(message: Extract<WebviewMessage, { command: "cleanupSquadWorktree" }>): Promise<void> {
    this._start("cleanup");
    if (!(await this._confirmCleanup(message.request))) {
      this._finish("cleanup");
      return;
    }
    const result = await this._services.squadWorktrees.cleanup(message.request);
    if (isSquadErr(result)) {
      this._emitError(result.error);
      return;
    }
    this._postMessage({
      command: "squadWorktreeCleanupResult",
      worktreeId: message.request.worktreeId,
      outcome: result.value,
    });
    await this._sendWorktrees();
  }

  private async _handleRetryDependencies(
    message: Extract<WebviewMessage, { command: "retrySquadWorktreeDependencies" }>
  ): Promise<void> {
    this._start("retryDependencies");
    const result = await this._services.squadWorktrees.retryDependencies(message.worktreeId, message.dependencies);
    if (isSquadErr(result)) {
      this._emitError(result.error);
      return;
    }
    this._postMessage({
      command: "squadWorktreeDependencyRetried",
      worktreeId: message.worktreeId,
      outcome: result.value,
    });
    await this._sendWorktrees();
  }

  private async _sendWorktrees(): Promise<void> {
    const result = await this._services.squadWorktrees.list();
    if (isSquadErr(result)) {
      this._emitError(result.error);
      return;
    }
    this._postMessage({ command: "squadWorktreesUpdate", worktrees: result.value, fetchedAt: this._now() });
  }

  private async _confirmCleanup(request: SquadWorktreeCleanupRequest): Promise<boolean> {
    const candidates = await this._services.squadWorktrees.findCleanupCandidates();
    const candidate = candidates.ok ? candidates.value.find((item) => item.worktree.id === request.worktreeId) : undefined;
    const message = cleanupConfirmationMessage(candidate, request);
    const answer = await vscode.window.showWarningMessage(message, { modal: true }, "Clean up worktree");
    return answer === "Clean up worktree";
  }

  private _start(operation: SquadWorktreeOperation): void {
    this._postMessage({ command: "squadWorktreeOperationStarted", operation });
  }

  private _finish(operation: SquadWorktreeOperation): void {
    this._postMessage({ command: "squadWorktreeOperationFinished", operation });
  }

  private _emitError(error: SquadError): void {
    this._postMessage({ command: "squadError", error });
  }
}

function cleanupConfirmationMessage(
  candidate: SquadWorktreeCleanupCandidate | undefined,
  request: SquadWorktreeCleanupRequest
): string {
  const reasonText = candidate?.reasons.length ? ` Reasons: ${candidate.reasons.join(", ")}.` : "";
  const blockerText = candidate?.blockers.length ? ` Blockers: ${candidate.blockers.join(", ")}.` : "";
  const discardText = request.discardChanges ? " NexKit may stash dirty changes and force removal after this confirmation." : "";
  const branchText = request.deleteBranch ? " The local branch will be deleted when Git says it is safe." : "";
  return `Clean up this Squad worktree?${reasonText}${blockerText}${discardText}${branchText}`;
}
