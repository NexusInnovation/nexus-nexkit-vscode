/**
 * Type definitions for the Nexkit webview panel
 * Re-exported from the main types file for convenience
 */

export type { WebviewMessage, ExtensionMessage } from "../../types/webviewMessages";

export interface WorkspaceState {
  hasWorkspace: boolean;
  isInitialized: boolean;
}

export type FilterMode = "all" | "selected" | "unselected";

export type GroupMode = "type" | "repository" | "none";

export interface TemplateFilters {
  status: FilterMode;
  types: string[];
  repositories: string[];
}

export interface WebviewPersistentState {
  expandedState: Record<string, boolean>;
  filterMode: FilterMode;
  groupMode: GroupMode;
  selectedFirst: boolean;
  typeFilters: string[];
  repositoryFilters: string[];
  activeTab?: string;
  lastSeenProfileCount?: number;
  /**
   * Unsaved Squad editor drafts keyed by edit target (SQD-029), so collapsing a
   * section, switching tabs or reloading the panel never loses user edits.
   */
  squadDrafts?: Record<string, SquadEditorDraft>;
}

/** A persisted, unsaved Squad editor draft (SQD-029). */
export interface SquadEditorDraft {
  /** Current (possibly edited) text in the editor. */
  draft: string;

  /** File content when editing started — the baseline for the dirty state. */
  baseContent: string;

  /**
   * `contentHash` of the document when editing started (governance docs only),
   * echoed as `baseContentHash` so the host can detect a write conflict.
   */
  baseContentHash?: string | null;
}
