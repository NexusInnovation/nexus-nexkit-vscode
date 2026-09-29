/**
 * Domain types for Squad ceremonies (SQD-047 / #262, PRD FR-055).
 *
 * Ceremonies are team meetings configured in `.squad/ceremonies.md`: each
 * `## <Name>` section holds a field table (trigger, when, facilitator, …), an
 * `Enabled` flag and an agenda. NexKit parses them read-only and offers a quick
 * action that asks the Squad coordinator agent to run one on demand.
 */

/** Workspace-root-relative POSIX path of the ceremonies file. */
export const SQUAD_CEREMONIES_RELATIVE_PATH = ".squad/ceremonies.md";

/** A single ceremony parsed from `.squad/ceremonies.md`. */
export interface SquadCeremony {
  /** Stable, slug-style identifier derived from the heading (unique per file). */
  id: string;

  /** Heading text, e.g. `Design Review`. */
  name: string;

  /** `Trigger` field (`auto` / `manual`), when set. */
  trigger?: string;

  /** `When` field (`before` / `after` / `weekly` …), when set. */
  when?: string;

  /** `Condition` field, when set. */
  condition?: string;

  /** `Facilitator` field, when set. */
  facilitator?: string;

  /** `Participants` field, when set. */
  participants?: string;

  /** `Time budget` field, when set. */
  timeBudget?: string;

  /**
   * Whether the ceremony is enabled. Defaults to `true` when the `Enabled`
   * field is absent; disabled ceremonies cannot be launched from the panel.
   */
  enabled: boolean;

  /** Agenda items in order (list markers stripped). */
  agenda: string[];
}

/** Read-only view of `.squad/ceremonies.md`. */
export interface SquadCeremoniesDocument {
  /** Workspace-root-relative POSIX path to the ceremonies file. */
  relativePath: string;

  /** Whether the file exists in the workspace. */
  exists: boolean;

  /** Ceremonies parsed from the file, in document order. */
  ceremonies: SquadCeremony[];

  /** True when the file exceeded the read cap and only a prefix was parsed. */
  truncated?: boolean;
}
