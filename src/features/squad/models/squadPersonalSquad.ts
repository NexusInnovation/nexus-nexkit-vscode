import type { SquadRosterMember } from "./squadRoster";

/** Initialization state for the user's personal/global Squad. */
export const SquadPersonalSquadState = {
  /** No personal Squad marker was found in the user's profile. */
  NotInitialized: "not-initialized",
  /** A personal Squad marker was found and its roster parsed successfully. */
  Initialized: "initialized",
} as const;

export type SquadPersonalSquadState =
  (typeof SquadPersonalSquadState)[keyof typeof SquadPersonalSquadState];

/** Stable scope identifier for personal Squad operations. */
export const SquadPersonalSquadScope = {
  /** User-profile/global scope, outside the current workspace. */
  Personal: "personal",
} as const;

export type SquadPersonalSquadScope =
  (typeof SquadPersonalSquadScope)[keyof typeof SquadPersonalSquadScope];

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
