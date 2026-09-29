import type {
  SquadBacklogItem,
  SquadWorktreeCleanupCandidate,
  SquadWorktreeCleanupOutcome,
  SquadWorktreeCreateOutcome,
  SquadWorktreeCreatePreview,
  SquadWorktreeDependencyOutcome,
  SquadWorktreeInfo,
} from "../../../squad/models";
import type { SquadWorktreeOperation } from "../../types/webviewMessages";

export interface SquadWorktreeDependencyRetryState {
  worktreeId: string;
  outcome: SquadWorktreeDependencyOutcome;
}

export interface SquadWorktreeCleanupResultState {
  worktreeId: string;
  outcome: SquadWorktreeCleanupOutcome;
}

export interface SquadWorktreeState {
  items: SquadBacklogItem[];
  itemsFetchedAt: number | null;
  worktrees: SquadWorktreeInfo[];
  worktreesFetchedAt: number | null;
  pending: SquadWorktreeOperation | null;
  preview: SquadWorktreeCreatePreview | null;
  lastOutcome: SquadWorktreeCreateOutcome | null;
  cleanupCandidates: SquadWorktreeCleanupCandidate[];
  lastCleanup: SquadWorktreeCleanupResultState | null;
  lastDependencyRetry: SquadWorktreeDependencyRetryState | null;
}

export const initialSquadWorktreeState: SquadWorktreeState = {
  items: [],
  itemsFetchedAt: null,
  worktrees: [],
  worktreesFetchedAt: null,
  pending: null,
  preview: null,
  lastOutcome: null,
  cleanupCandidates: [],
  lastCleanup: null,
  lastDependencyRetry: null,
};
