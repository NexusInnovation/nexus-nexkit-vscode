/**
 * Domain types for the Squad roster and agent charters.
 *
 * Covers PRD FR-022 (roster from `.squad/team.md`, agents from
 * `.squad/agents/<id>/charter.md`) and FR-023 (read/edit charters with a backup
 * before any write). These are read-model shapes; editing flows layer their
 * own commands on top.
 */

/**
 * A single Squad team member, sourced from `.squad/team.md` and correlated
 * with an agent folder under `.squad/agents/<id>/` when one exists.
 */
export interface SquadRosterMember {
  /** Stable agent identifier / folder name (e.g. "morpheus"). */
  id: string;

  /** Display name (e.g. "Morpheus"). */
  name: string;

  /** Role or title (e.g. "Lead / Architect"). */
  role?: string;

  /** Short one-line description of the member's remit. */
  summary?: string;

  /** Whether a `.squad/agents/<id>/charter.md` file was found. */
  hasCharter: boolean;
}

/**
 * An agent charter parsed from `.squad/agents/<id>/charter.md` (FR-022/FR-023).
 * `content` holds the raw markdown for read/edit in the panel.
 */
export interface SquadCharter {
  /** Agent identifier the charter belongs to. */
  agentId: string;

  /** Workspace-root-relative path to the charter file. */
  relativePath: string;

  /** Raw markdown content of the charter. */
  content: string;
}
