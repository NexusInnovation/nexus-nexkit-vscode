/**
 * Domain types describing the Squad project version stamped in
 * `.github/agents/squad.agent.md` (PRD FR-002).
 *
 * Squad writes a `<!-- version: x -->` HTML comment into the generated project
 * agent file. NexKit reads that stamp to know which Squad version a repository
 * was initialised with. The value can be:
 *
 * - a concrete semver (e.g. `1.4.2`) → {@link SquadProjectVersionKind.Pinned};
 * - the `0.0.0-source` sentinel Squad emits when the project tracks the tool
 *   source rather than a released version → {@link SquadProjectVersionKind.Source};
 * - absent (the file exists but carries no stamp) →
 *   {@link SquadProjectVersionKind.Missing}, which maps to the `unknown`
 *   version status required by FR-002.
 *
 * A stamp that is present but not a valid version is a hard parse failure — it
 * must surface an actionable error, never be silently treated as `unknown`.
 */

/**
 * Sentinel version Squad stamps when a project tracks the tool source instead
 * of a published release. It is a valid, expected state (not an error) but is
 * intentionally not comparable against published versions.
 */
export const SQUAD_SOURCE_VERSION = "0.0.0-source";

/**
 * Classification of a parsed project version stamp.
 */
export const SquadProjectVersionKind = {
  /** A concrete, comparable semver such as `1.4.2`. */
  Pinned: "pinned",
  /** The `0.0.0-source` sentinel — a from-source build, not comparable. */
  Source: "source",
  /** The agent file exists but carries no `<!-- version: x -->` stamp. */
  Missing: "missing",
} as const;

export type SquadProjectVersionKind = (typeof SquadProjectVersionKind)[keyof typeof SquadProjectVersionKind];

/**
 * The Squad project version read from `.github/agents/squad.agent.md` (FR-002).
 */
export interface SquadProjectVersion {
  /** How the stamp was classified. */
  kind: SquadProjectVersionKind;

  /**
   * The raw stamp text exactly as read (trimmed), or `null` when no stamp is
   * present. For {@link SquadProjectVersionKind.Source} this is
   * {@link SQUAD_SOURCE_VERSION}.
   */
  raw: string | null;

  /**
   * The comparable semver string when {@link kind} is
   * {@link SquadProjectVersionKind.Pinned}, otherwise `null`. Source and
   * missing stamps are not comparable.
   */
  version: string | null;

  /**
   * `true` when the project tracks the Squad source (`0.0.0-source`). Such
   * projects have no meaningful "update available" comparison.
   */
  isSource: boolean;
}
