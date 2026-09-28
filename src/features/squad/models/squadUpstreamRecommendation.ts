/**
 * Upstream inheritance recommendations (SQD-037, PRD FR-033/FR-034/FR-035).
 *
 * Describes the recommended org → team → project hierarchy evaluated against
 * the sources configured in `.squad/upstream.json`, the preconfigured Nexus
 * marketplace suggestion per level, and the warnings raised when a source
 * cannot behave as the user likely expects (e.g. `squad upstream` clones a
 * full git repository and ignores sub-paths).
 *
 * Pure, serialisable descriptors — no `vscode` imports — so both the
 * extension host and the Preact webview can consume them.
 */

import type { SquadUpstreamKind } from "./squadConfig";

/** Inheritance level in the recommended hierarchy (FR-033). */
export const SquadUpstreamLevel = {
  Org: "org",
  Team: "team",
  Project: "project",
} as const;

export type SquadUpstreamLevel = (typeof SquadUpstreamLevel)[keyof typeof SquadUpstreamLevel];

/** Recommended inheritance order, broadest first (FR-033). */
export const SQUAD_UPSTREAM_LEVEL_ORDER: readonly SquadUpstreamLevel[] = [
  SquadUpstreamLevel.Org,
  SquadUpstreamLevel.Team,
  SquadUpstreamLevel.Project,
];

/** Whether a recommended level is covered by a configured source. */
export const SquadUpstreamLevelStatus = {
  Configured: "configured",
  Missing: "missing",
} as const;

export type SquadUpstreamLevelStatus = (typeof SquadUpstreamLevelStatus)[keyof typeof SquadUpstreamLevelStatus];

/** Stable codes for upstream recommendation warnings. */
export const SquadUpstreamWarningCode = {
  /** A git source references a sub-path that `squad upstream` ignores (FR-035). */
  SubpathUnsupported: "subpath-unsupported",
  /** A git source points at a monorepo that will be cloned in full (FR-035). */
  FullClone: "full-clone",
  /** Reserved per-level folders cannot be targeted by `squad upstream` (FR-034/FR-035). */
  ReservedFolderLimitation: "reserved-folder-limitation",
  /** Configured sources are listed out of the org → team → project order (FR-033). */
  HierarchyOrder: "hierarchy-order",
} as const;

export type SquadUpstreamWarningCode = (typeof SquadUpstreamWarningCode)[keyof typeof SquadUpstreamWarningCode];

/** Severity of an upstream recommendation warning. */
export const SquadUpstreamWarningSeverity = {
  Warning: "warning",
  Info: "info",
} as const;

export type SquadUpstreamWarningSeverity = (typeof SquadUpstreamWarningSeverity)[keyof typeof SquadUpstreamWarningSeverity];

/** A visible, actionable warning about the upstream configuration. */
export interface SquadUpstreamWarning {
  code: SquadUpstreamWarningCode;
  severity: SquadUpstreamWarningSeverity;

  /** What is wrong, in plain language. */
  message: string;

  /** What the user should do about it. */
  remediation: string;

  /** Concrete alternatives the user can adopt, when applicable. */
  alternatives?: string[];

  /** The configured source the warning applies to, when source-specific. */
  sourceId?: string;
}

/** Preconfigured source suggested for a level (FR-034). */
export interface SquadUpstreamSuggestedSource {
  /** `owner/repo` of the suggested repository. */
  repository: string;

  /** Clone URL of the suggested repository. */
  url: string;

  /** Folder reserved for this level inside the repository. */
  reservedFolder: string;

  /**
   * Source kind recommended for this level. Because `squad upstream` cannot
   * target a sub-path, a JSON export generated from the reserved folder is
   * the viable way to consume a single level of the shared repository.
   */
  recommendedKind: SquadUpstreamKind;

  /** Always `false` today: `squad upstream` does not support sub-paths. */
  subpathSupported: boolean;
}

/** Recommendation for a single level of the hierarchy. */
export interface SquadUpstreamLevelRecommendation {
  level: SquadUpstreamLevel;

  /** 1-based position in the recommended order (org = 1). */
  position: number;

  /** Display label, e.g. "Organization". */
  label: string;

  /** What belongs at this level. */
  description: string;

  status: SquadUpstreamLevelStatus;

  /** Configured source ids classified at this level, in manifest order. */
  sourceIds: string[];

  /** Preconfigured Nexus source suggested for this level. */
  suggestion: SquadUpstreamSuggestedSource;
}

/** Full recommendation snapshot for the Upstreams section. */
export interface SquadUpstreamRecommendations {
  /** Always the three levels, in org → team → project order. */
  levels: SquadUpstreamLevelRecommendation[];

  /** Warnings raised by the rules; empty when nothing needs attention. */
  warnings: SquadUpstreamWarning[];

  /**
   * Configured sources that do not map to a level. Free sources remain
   * allowed; they are listed so the user can see they were not classified.
   */
  unclassifiedSourceIds: string[];
}
