import type { SquadDetectionResult, SquadVersionStatus } from "./squadDetection";

/** Update targets covered by Squad update detection (FR-005). */
export const SquadUpdateTarget = {
  /** The installed Squad CLI package. */
  Cli: "cli",
  /** The Squad files generated in the current workspace. */
  Project: "project",
} as const;

export type SquadUpdateTarget = (typeof SquadUpdateTarget)[keyof typeof SquadUpdateTarget];

/**
 * Upgrade commands exposed as data for follow-up flows (#246/#247). The host
 * still owns confirmation, backups and actual execution.
 */
export const SquadUpgradeCommand = {
  /** `squad upgrade --self` (no workspace-file backup required). */
  CliSelf: "upgrade-self",
  /** `squad upgrade` (requires a workspace backup before execution). */
  Project: "upgrade",
} as const;

export type SquadUpgradeCommand = (typeof SquadUpgradeCommand)[keyof typeof SquadUpgradeCommand];

/** Reusable contract describing one possible Squad update. */
export interface SquadUpdateCandidate {
  /** CLI or project update target. */
  target: SquadUpdateTarget;

  /** Installed/stamped version, or `null` when unavailable/unknown. */
  currentVersion: string | null;

  /** Latest known version from the update source, or `null` when unknown. */
  latestVersion: string | null;

  /** Freshness of {@link currentVersion} relative to {@link latestVersion}. */
  status: SquadVersionStatus;

  /** True only when a newer latest version is known. */
  updateAvailable: boolean;

  /** The follow-up command #246/#247 should execute after confirmation. */
  upgradeCommand: SquadUpgradeCommand;

  /** FR-005: the command must never run without explicit confirmation. */
  requiresConfirmation: true;

  /** FR-006: project upgrades require a prior backup; CLI self-upgrades do not. */
  requiresBackup: boolean;

  /** User-facing summary/remediation for the current update state. */
  message: string;
}

/** Combined update-check snapshot sent over the host/webview boundary. */
export interface SquadUpdatesResult {
  /** Detection snapshot enriched with latest-version freshness. */
  detection: SquadDetectionResult;

  /** CLI update candidate, reusable by the CLI-upgrade flow (#246). */
  cli: SquadUpdateCandidate;

  /** Project update candidate, reusable by the project-upgrade flow (#247). */
  project: SquadUpdateCandidate;

  /** Epoch milliseconds when the update check completed. */
  checkedAt: number;
}
