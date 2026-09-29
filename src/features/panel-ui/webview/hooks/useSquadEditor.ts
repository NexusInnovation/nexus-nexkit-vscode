/**
 * Edit-session hook for Squad charters and governance docs (SQD-029, PRD
 * FR-023/FR-024).
 *
 * Owns the edit/save/cancel lifecycle for one editable Squad file: the draft
 * and its dirty state, the in-flight save, and how the host's reply is
 * interpreted. Saves go through {@link useSquadState} (`saveSquadCharter` /
 * `saveSquadDoc`), which the host routes to the backup-first controlled write
 * service (SQD-026/SQD-027). Replies are read from the central
 * `SquadState.lastWrite` outcome — never a per-hook message listener.
 *
 * Drafts are persisted in the webview state so collapsing a section, switching
 * tabs or reloading the panel never loses unsaved edits. Components stay
 * purely presentational: they render {@link UseSquadEditorResult} and call its
 * actions.
 */

import { useEffect, useState } from "preact/hooks";
import type { SquadError } from "../../../squad/models";
import type { SquadWriteSummary } from "../../types/webviewMessages";
import type { SquadEditorDraft } from "../types";
import type { SquadEditTarget } from "../types/squadState";
import { useSquadState } from "./useSquadState";
import { useWebviewPersistentState } from "./useWebviewPersistentState";

/** The file currently shown by an editor, as read from the Squad AppState slice. */
export interface SquadEditorSource {
  /** Which charter or governance doc is edited. */
  target: SquadEditTarget;

  /** Current on-disk content known to the panel. */
  content: string;

  /**
   * Version token of the governance doc (SQD-027); `null` when absent,
   * `undefined` when the host did not provide one (charters).
   */
  contentHash?: string | null;

  /** True when {@link content} was truncated; truncated files are not editable. */
  truncated?: boolean;
}

/** Hook result for a single Squad editor. */
export interface UseSquadEditorResult {
  /** True while an edit session (draft) is open. */
  isEditing: boolean;

  /** Current draft text (empty when not editing). */
  draft: string;

  /** True when the draft differs from the content editing started from. */
  isDirty: boolean;

  /** True while this editor's save is awaiting the host reply. */
  isSaving: boolean;

  /** True when Save can be pressed (dirty, idle and no other Squad work in flight). */
  canSave: boolean;

  /** True when this file may be edited from the panel. */
  canEdit: boolean;

  /** Why editing is unavailable, or `null` when {@link canEdit}. */
  readOnlyReason: string | null;

  /** Failure of the last save from this editor; the draft is kept. */
  saveError: SquadError | null;

  /** True when {@link saveError} is a `write-conflict` (file changed on disk). */
  isConflict: boolean;

  /** Summary of the last successful save from this editor, for the success notice. */
  savedSummary: SquadWriteSummary | null;

  /** True when the file changed on disk after the draft was started. */
  hasExternalChange: boolean;

  /** True while the "discard unsaved changes?" confirmation is shown. */
  isConfirmingDiscard: boolean;

  /** Open an edit session seeded with the current content. */
  startEdit: () => void;

  /** Replace the draft text. */
  updateDraft: (value: string) => void;

  /** Save the draft through the backup-first host write path. */
  save: () => void;

  /** Leave edit mode; asks for confirmation first when the draft is dirty. */
  cancel: () => void;

  /** Confirm discarding the unsaved draft. */
  confirmDiscard: () => void;

  /** Dismiss the discard confirmation and keep editing. */
  keepEditing: () => void;

  /** Discard the draft and reload the latest Squad files from disk. */
  discardAndReload: () => void;

  /** Hide the success notice. */
  dismissSaved: () => void;
}

/** Stable key identifying an edit target (used for persisted drafts). */
export function squadEditTargetKey(target: SquadEditTarget): string {
  return target.type === "charter" ? `charter:${target.agentId}` : `doc:${target.kind}`;
}

/** True when two edit targets refer to the same file. */
export function isSameSquadEditTarget(a: SquadEditTarget, b: SquadEditTarget): boolean {
  return squadEditTargetKey(a) === squadEditTargetKey(b);
}

const TRUNCATED_REASON = "This file is too large to edit safely in the panel. Open it in the VS Code editor to change it.";

/**
 * Hook managing one Squad file edit session.
 */
export function useSquadEditor(source: SquadEditorSource): UseSquadEditorResult {
  const { isLoading, lastWrite, saveCharter, saveDoc, refresh } = useSquadState();
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();
  const key = squadEditTargetKey(source.target);

  const [session, setSession] = useState<SquadEditorDraft | null>(() => getWebviewState().squadDrafts?.[key] ?? null);
  const [pendingSequence, setPendingSequence] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<SquadError | null>(null);
  const [savedSummary, setSavedSummary] = useState<SquadWriteSummary | null>(null);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  const commitSession = (next: SquadEditorDraft | null) => {
    setSession(next);
    const state = getWebviewState();
    const drafts = { ...(state.squadDrafts ?? {}) };
    if (next) {
      drafts[key] = next;
    } else {
      delete drafts[key];
    }
    setWebviewState({ ...state, squadDrafts: drafts });
  };

  // A restored draft that already matches the file (e.g. its save landed while
  // the editor was unmounted) carries no unsaved work — drop it.
  useEffect(() => {
    if (session && session.draft === source.content) {
      commitSession(null);
    }
  }, []);

  // Resolve this editor's pending save from the central write outcome.
  useEffect(() => {
    if (pendingSequence === null || !lastWrite || lastWrite.sequence <= pendingSequence) {
      return;
    }
    if (lastWrite.ok) {
      if (!isSameSquadEditTarget(lastWrite.target, source.target)) {
        return;
      }
      commitSession(null);
      setSavedSummary(lastWrite.summary);
    } else {
      setSaveError(lastWrite.error);
    }
    setPendingSequence(null);
  }, [lastWrite, pendingSequence]);

  const canEdit = !source.truncated;
  const isSaving = pendingSequence !== null;
  const isDirty = session !== null && session.draft !== session.baseContent;

  const hasExternalChange =
    session !== null &&
    !isSaving &&
    (source.contentHash !== undefined && session.baseContentHash !== undefined
      ? source.contentHash !== session.baseContentHash
      : source.content !== session.baseContent);

  const startEdit = () => {
    if (!canEdit || session) {
      return;
    }
    setSaveError(null);
    setSavedSummary(null);
    setIsConfirmingDiscard(false);
    commitSession({ draft: source.content, baseContent: source.content, baseContentHash: source.contentHash });
  };

  const updateDraft = (value: string) => {
    if (!session || isSaving) {
      return;
    }
    commitSession({ ...session, draft: value });
  };

  const save = () => {
    if (!session || !isDirty || isSaving || isLoading) {
      return;
    }
    setSaveError(null);
    setSavedSummary(null);
    setIsConfirmingDiscard(false);
    setPendingSequence(lastWrite?.sequence ?? 0);
    if (source.target.type === "charter") {
      saveCharter(source.target.agentId, session.draft);
    } else {
      saveDoc(source.target.kind, session.draft, session.baseContentHash);
    }
  };

  const closeSession = () => {
    commitSession(null);
    setSaveError(null);
    setIsConfirmingDiscard(false);
  };

  const cancel = () => {
    if (isSaving) {
      return;
    }
    if (isDirty) {
      setIsConfirmingDiscard(true);
      return;
    }
    closeSession();
  };

  const discardAndReload = () => {
    if (isSaving) {
      return;
    }
    closeSession();
    refresh();
  };

  return {
    isEditing: session !== null,
    draft: session?.draft ?? "",
    isDirty,
    isSaving,
    canSave: isDirty && !isSaving && !isLoading,
    canEdit,
    readOnlyReason: canEdit ? null : TRUNCATED_REASON,
    saveError,
    isConflict: saveError?.code === "write-conflict",
    savedSummary,
    hasExternalChange,
    isConfirmingDiscard,
    startEdit,
    updateDraft,
    save,
    cancel,
    confirmDiscard: closeSession,
    keepEditing: () => setIsConfirmingDiscard(false),
    discardAndReload,
    dismissSaved: () => setSavedSummary(null),
  };
}
