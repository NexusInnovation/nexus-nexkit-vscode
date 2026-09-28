import type { SquadCliSource } from "./squadDetection";
import type { SquadUpdatesResult } from "./squadUpdates";

/**
 * Serialisable summary of a confirmed Squad CLI self-upgrade (SQD-031,
 * FR-005). Sent over the host/webview boundary; contains versions only — no
 * paths, command output or user content.
 */
export interface SquadCliUpgradeSummary {
  /**
   * True when `squad upgrade --self` ran and the new version was verified.
   * False only when the CLI was already up to date and nothing was executed.
   */
  upgraded: boolean;

  /** CLI version detected before the upgrade. */
  previousVersion: string;

  /** CLI version detected after the upgrade (equals previous when not upgraded). */
  installedVersion: string;

  /** Latest published CLI version the upgrade targeted. */
  latestVersion: string;

  /** How the upgraded CLI is resolved (global install or custom path). */
  source?: SquadCliSource;
}

/** Full outcome of a CLI upgrade, including the post-upgrade update snapshot. */
export interface SquadCliUpgradeOutcome extends SquadCliUpgradeSummary {
  /** Fresh update check taken after the upgrade (or the pre-check when skipped). */
  updates: SquadUpdatesResult;
}
