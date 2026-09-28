/**
 * Domain types for editable Squad governance documents.
 *
 * Covers PRD FR-024 (display and edit `.squad/decisions.md` and
 * `.squad/routing.md`). Modelled as a shared markdown-document shape so the
 * panel can treat both uniformly, with a discriminating `kind`.
 */

/** Which governance document a {@link SquadMarkdownDoc} represents. */
export const SquadDocKind = {
  Decisions: "decisions",
  Routing: "routing",
} as const;

export type SquadDocKind = (typeof SquadDocKind)[keyof typeof SquadDocKind];

/**
 * A raw markdown governance document read from `.squad/`.
 * Held as raw content so the panel can render and round-trip edits with a
 * backup before writing (FR-023/FR-024).
 */
export interface SquadMarkdownDoc {
  /** Discriminates decisions vs. routing. */
  kind: SquadDocKind;

  /** Workspace-root-relative path to the document. */
  relativePath: string;

  /** Whether the document exists in the workspace. */
  exists: boolean;

  /** Raw markdown content, or an empty string when {@link exists} is false. */
  content: string;

  /**
   * Version token for optimistic concurrency (SQD-027): SHA-256 hex digest of
   * the full on-disk bytes when read, or `null` when the document is absent.
   * Echo it back as `baseContentHash` on save so the host can reject writes
   * that would clobber changes made on disk since the panel loaded the doc.
   */
  contentHash?: string | null;

  /**
   * True when {@link content} was cut at the panel read limit. Truncated
   * documents must not be saved from the panel (the tail would be lost); the
   * host refuses such saves with an actionable error.
   */
  truncated?: boolean;
}
