import { useAppState } from "./useAppState";
import { useVSCodeAPI } from "./useVSCodeAPI";
import type {
  SquadBacklogItem,
  SquadBacklogItemQuery,
  SquadWorktreeCleanupCandidate,
  SquadWorktreeCleanupOutcome,
  SquadWorktreeCleanupRequest,
  SquadWorktreeCreateOutcome,
  SquadWorktreeCreatePreview,
  SquadWorktreeCreateRequest,
  SquadWorktreeDependencyMode,
  SquadWorktreeDependencyOutcome,
  SquadWorktreeInfo,
} from "../../../squad/models";
import type { SquadWorktreeOperation } from "../../types/webviewMessages";

export interface UseSquadWorktreesResult {
  items: SquadBacklogItem[];
  itemsFetchedAt: number | null;
  worktrees: SquadWorktreeInfo[];
  worktreesFetchedAt: number | null;
  pending: SquadWorktreeOperation | null;
  preview: SquadWorktreeCreatePreview | null;
  lastOutcome: SquadWorktreeCreateOutcome | null;
  cleanupCandidates: SquadWorktreeCleanupCandidate[];
  lastCleanup: { worktreeId: string; outcome: SquadWorktreeCleanupOutcome } | null;
  lastDependencyRetry: { worktreeId: string; outcome: SquadWorktreeDependencyOutcome } | null;
  listBacklogItems: (query?: SquadBacklogItemQuery) => void;
  listWorktrees: () => void;
  previewCreate: (request: SquadWorktreeCreateRequest) => void;
  createWorktree: (request: SquadWorktreeCreateRequest) => void;
  openWorktree: (worktreeId: string, newWindow?: boolean) => void;
  findCleanupCandidates: () => void;
  cleanupWorktree: (request: SquadWorktreeCleanupRequest) => void;
  retryDependencies: (worktreeId: string, dependencies?: SquadWorktreeDependencyMode) => void;
}

export function useSquadWorktrees(): UseSquadWorktreesResult {
  const { squadWorktrees } = useAppState();
  const messenger = useVSCodeAPI();

  return {
    items: squadWorktrees.items,
    itemsFetchedAt: squadWorktrees.itemsFetchedAt,
    worktrees: squadWorktrees.worktrees,
    worktreesFetchedAt: squadWorktrees.worktreesFetchedAt,
    pending: squadWorktrees.pending,
    preview: squadWorktrees.preview,
    lastOutcome: squadWorktrees.lastOutcome,
    cleanupCandidates: squadWorktrees.cleanupCandidates,
    lastCleanup: squadWorktrees.lastCleanup,
    lastDependencyRetry: squadWorktrees.lastDependencyRetry,
    listBacklogItems: (query) => messenger.sendMessage({ command: "listSquadBacklogItems", query }),
    listWorktrees: () => messenger.sendMessage({ command: "getSquadWorktrees" }),
    previewCreate: (request) => messenger.sendMessage({ command: "previewSquadWorktree", request }),
    createWorktree: (request) => messenger.sendMessage({ command: "createSquadWorktree", request }),
    openWorktree: (worktreeId, newWindow) => messenger.sendMessage({ command: "openSquadWorktree", worktreeId, newWindow }),
    findCleanupCandidates: () => messenger.sendMessage({ command: "findSquadWorktreeCleanup" }),
    cleanupWorktree: (request) => messenger.sendMessage({ command: "cleanupSquadWorktree", request }),
    retryDependencies: (worktreeId, dependencies) =>
      messenger.sendMessage({ command: "retrySquadWorktreeDependencies", worktreeId, dependencies }),
  };
}
