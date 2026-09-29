import type { SquadBacklogProviderId } from "./squadBacklog";
import type { SquadError } from "./squadResult";

export const SquadWorktreeDependencyMode = {
  Auto: "auto",
  Install: "install",
  Link: "link",
  None: "none",
} as const;

export type SquadWorktreeDependencyMode =
  (typeof SquadWorktreeDependencyMode)[keyof typeof SquadWorktreeDependencyMode];

export const SquadWorktreeDependencyState = {
  Installed: "installed",
  Linked: "linked",
  Skipped: "skipped",
  Failed: "failed",
  Unknown: "unknown",
} as const;

export type SquadWorktreeDependencyState =
  (typeof SquadWorktreeDependencyState)[keyof typeof SquadWorktreeDependencyState];

export const SquadWorktreeCleanupReason = {
  PullRequestMerged: "pr-merged",
  MergedIntoBase: "merged-into-base",
  UpstreamGone: "upstream-gone",
  ItemClosed: "item-closed",
  Prunable: "prunable",
} as const;

export type SquadWorktreeCleanupReason =
  (typeof SquadWorktreeCleanupReason)[keyof typeof SquadWorktreeCleanupReason];

export const SquadWorktreeBranchSource = {
  New: "new",
  Local: "local",
  Remote: "remote",
} as const;

export type SquadWorktreeBranchSource =
  (typeof SquadWorktreeBranchSource)[keyof typeof SquadWorktreeBranchSource];

export const SquadWorktreeRemovalFallback = {
  None: "none",
  LongPaths: "longpaths",
  FsRm: "fs-rm",
  Robocopy: "robocopy",
} as const;

export type SquadWorktreeRemovalFallback =
  (typeof SquadWorktreeRemovalFallback)[keyof typeof SquadWorktreeRemovalFallback];

export interface SquadWorktreeInfo {
  id: string;
  displayPath: string;
  branch: string | null;
  head: string;
  issueNumber: number | null;
  isMain: boolean;
  isCurrentWindow: boolean;
  locked: boolean;
  prunable: boolean;
  dirty: boolean | null;
  ahead: number | null;
  behind: number | null;
  baseBranch: string | null;
  dependencies: SquadWorktreeDependencyState;
}

export interface SquadWorktreeWarning {
  code: string;
  message: string;
  remediation?: string;
}

export interface SquadWorktreeCreateRequest {
  providerId: SquadBacklogProviderId;
  itemId: string;
  baseBranch?: string;
  dependencies?: SquadWorktreeDependencyMode;
  openInNewWindow?: boolean;
}

export interface SquadWorktreeCreatePreview {
  providerId: SquadBacklogProviderId;
  itemId: string;
  issueNumber: number;
  branch: string;
  displayPath: string;
  baseBranch: string;
  branchSource: SquadWorktreeBranchSource;
  warnings: SquadWorktreeWarning[];
}

export interface SquadWorktreeDependencyOutcome {
  mode: SquadWorktreeDependencyMode;
  state: SquadWorktreeDependencyState;
  error: SquadError | null;
}

export interface SquadWorktreeCreateOutcome {
  worktree: SquadWorktreeInfo;
  branch: string;
  branchSource: SquadWorktreeBranchSource;
  baseBranch: string;
  baseFetched: boolean;
  dependencies: SquadWorktreeDependencyOutcome;
  seededCount: number;
  opened: boolean;
  warnings: SquadWorktreeWarning[];
}

export interface SquadWorktreeCleanupCandidate {
  worktree: SquadWorktreeInfo;
  reasons: SquadWorktreeCleanupReason[];
  blockers: ("dirty" | "unpushed" | "current-window" | "locked")[];
}

export interface SquadWorktreeCleanupRequest {
  worktreeId: string;
  deleteBranch: boolean;
  discardChanges: boolean;
}

export interface SquadWorktreeCleanupOutcome {
  removed: boolean;
  branchDeleted: boolean;
  stashed: boolean;
  fallback: SquadWorktreeRemovalFallback;
  warnings: SquadWorktreeWarning[];
}

