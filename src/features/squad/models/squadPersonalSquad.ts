import type { SquadDetectionResult } from "./squadDetection";
import type { SquadRosterMember } from "./squadRoster";

/** Initialization state for the user's personal/global Squad. */
export const SquadPersonalSquadState = {
  /** No personal Squad marker was found in the user's profile. */
  NotInitialized: "not-initialized",
  /** A personal Squad marker was found and its roster parsed successfully. */
  Initialized: "initialized",
} as const;

export type SquadPersonalSquadState = (typeof SquadPersonalSquadState)[keyof typeof SquadPersonalSquadState];

/** Stable scope identifier for personal Squad operations. */
export const SquadPersonalSquadScope = {
  /** User-profile/global scope, outside the current workspace. */
  Personal: "personal",
} as const;

export type SquadPersonalSquadScope = (typeof SquadPersonalSquadScope)[keyof typeof SquadPersonalSquadScope];

/** User-facing warning shown anywhere personal/global Squad can be changed. */
export const PERSONAL_SQUAD_SCOPE_WARNING =
  "Personal Squad lives outside the current workspace and can affect future Squad sessions for this user profile.";

/** Serialized, webview-safe status for the user's personal Squad. */
export interface SquadPersonalSquadStatus {
  /** Whether NexKit found a usable personal Squad. */
  state: SquadPersonalSquadState;

  /** Scope this status describes. */
  scope: SquadPersonalSquadScope;

  /** Human-readable target that avoids exposing an absolute user path. */
  targetLabel: string;

  /** Marker used for detection, relative to the personal Squad root. */
  markerRelativePath: string;

  /** Explicit local/personal scope warning for UI and confirmation flows. */
  warning: string;

  /** Parsed roster when initialized; empty when not initialized. */
  roster: SquadRosterMember[];

  /** Convenience count for compact UI rendering. */
  memberCount: number;
}

/** Result of running, or skipping, personal Squad initialization. */
export interface SquadPersonalSquadInitOutcome {
  /** Status after the operation. */
  status: SquadPersonalSquadStatus;

  /** True when the personal Squad was already initialized and no CLI command ran. */
  alreadyInitialized: boolean;

  /** Captured CLI output for diagnostics; intentionally not telemetry-facing. */
  stdout?: string;

  /** Captured CLI stderr for diagnostics; warnings can appear on success. */
  stderr?: string;
}

/** Whether the current workspace is a consult-mode Squad copy. */
export const SquadConsultModeState = {
  /** `.squad/config.json` is absent or does not opt into consult mode. */
  Inactive: "inactive",
  /** `.squad/config.json` contains `"consult": true`. */
  Active: "active",
} as const;

export type SquadConsultModeState = (typeof SquadConsultModeState)[keyof typeof SquadConsultModeState];

/** Supported consult-mode operations. */
export const SquadConsultModeOperation = {
  /** Copy the personal Squad into the current workspace with consult mode enabled. */
  Consult: "consult",
  /** Merge consult-mode learnings back into the personal Squad. */
  Extract: "extract",
} as const;

export type SquadConsultModeOperation = (typeof SquadConsultModeOperation)[keyof typeof SquadConsultModeOperation];

/** Workspace-local warning shown before consult mode writes. */
export const CONSULT_MODE_SCOPE_WARNING =
  "Consult mode copies your personal Squad into this workspace and writes local .squad/ files that are excluded from git.";

/** Personal-scope warning shown before extracting consult learnings. */
export const CONSULT_MODE_EXTRACT_WARNING =
  "Extract merges learnings from this workspace back into your personal Squad, which can affect future Squad sessions for this user profile.";

/** Serialized, webview-safe status for consult mode in the current workspace. */
export interface SquadConsultModeStatus {
  /** Whether this workspace is currently marked as consult mode. */
  state: SquadConsultModeState;

  /** Human-readable target that avoids exposing an absolute workspace path. */
  targetLabel: string;

  /** Marker used for detection, relative to the workspace root. */
  markerRelativePath: string;

  /** Explicit local/personal scope warning for UI and confirmation flows. */
  warning: string;

  /** Paths the Squad CLI keeps out of source control for consult mode. */
  excludedRelativePaths: string[];

  /** Personal Squad status reused as the source/merge target for consult mode. */
  personalStatus: SquadPersonalSquadStatus;
}

/** Result of a consult/extract operation. */
export interface SquadConsultModeOutcome {
  /** Operation that ran. */
  operation: SquadConsultModeOperation;

  /** Status after the operation. */
  status: SquadConsultModeStatus;

  /** True when consult mode was already active and no CLI command ran. */
  alreadyActive?: boolean;

  /** Path of the backup taken before running the CLI, or `null` when no artifacts existed. */
  backupPath: string | null;

  /** Fresh workspace detection after the operation, when available. */
  detection?: SquadDetectionResult;

  /** Captured CLI output for diagnostics; intentionally not telemetry-facing. */
  stdout?: string;

  /** Captured CLI stderr for diagnostics; warnings can appear on success. */
  stderr?: string;

  /** CLI duration in milliseconds, when a command ran. */
  durationMs?: number;
}
