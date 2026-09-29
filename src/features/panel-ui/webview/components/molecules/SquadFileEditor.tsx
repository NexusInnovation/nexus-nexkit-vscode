import type { ComponentChildren } from "preact";
import type { UseSquadEditorResult } from "../../hooks/useSquadEditor";
import type { SquadWriteSummary } from "../../../types/webviewMessages";
import { SquadErrorNotice } from "./SquadErrorNotice";

interface SquadFileEditorProps {
  /** Human-readable file label, e.g. `decisions.md` or `trinity charter`. */
  label: string;

  /** Workspace-relative path of the file being edited. */
  relativePath: string;

  /** Edit session state and actions from {@link useSquadEditor}. */
  editor: UseSquadEditorResult;

  /** Label of the button that opens the editor (defaults to "Edit"). */
  editLabel?: string;

  /** Read-only view rendered while not editing. */
  children?: ComponentChildren;
}

/** Success notice shown after a save, including whether a backup was taken. */
function SquadSaveNotice({ summary, onDismiss }: { summary: SquadWriteSummary; onDismiss: () => void }) {
  return (
    <div class="squad-editor-saved" role="status">
      <i class="codicon codicon-pass" aria-hidden="true"></i>
      <span class="squad-editor-saved-message">
        {summary.created ? "Created" : "Saved"} <code>{summary.relativePath}</code> ({summary.bytesWritten.toLocaleString()}{" "}
        bytes).{" "}
        {summary.backupCreated
          ? "Your previous Squad files were backed up first."
          : "No existing Squad files needed a backup."}
      </span>
      <button class="squad-editor-dismiss" onClick={onDismiss} aria-label="Dismiss save notice" title="Dismiss">
        <i class="codicon codicon-close" aria-hidden="true"></i>
      </button>
    </div>
  );
}

/**
 * SquadFileEditor Component (SQD-029, FR-023/FR-024)
 *
 * Purely presentational edit/save/cancel UI for one Squad charter or
 * governance document. Shows the read-only view with an Edit action, then a
 * textarea with dirty-state, backup notice, inline save errors (with a reload
 * affordance on write conflicts), a discard confirmation and a success notice
 * that reports whether BackupService captured the previous files. All state
 * and side effects come from {@link UseSquadEditorResult}.
 */
export function SquadFileEditor({ label, relativePath, editor, editLabel = "Edit", children }: SquadFileEditorProps) {
  if (!editor.isEditing) {
    return (
      <div class="squad-editor">
        <div class="squad-editor-toolbar">
          <button
            class="squad-editor-button"
            onClick={editor.startEdit}
            disabled={!editor.canEdit}
            title={editor.readOnlyReason ?? `${editLabel} ${label}`}
            aria-label={`${editLabel} ${label}`}
          >
            <i class="codicon codicon-edit" aria-hidden="true"></i> {editLabel}
          </button>
        </div>
        {editor.readOnlyReason && <p class="squad-editor-readonly-note">{editor.readOnlyReason}</p>}
        {editor.savedSummary && <SquadSaveNotice summary={editor.savedSummary} onDismiss={editor.dismissSaved} />}
        {children}
      </div>
    );
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      editor.save();
    }
  };

  return (
    <div class="squad-editor squad-editor-editing">
      <p class="squad-editor-backup-note">
        <i class="codicon codicon-shield" aria-hidden="true"></i> Saving overwrites <code>{relativePath}</code>. NexKit
        backs up your Squad files first and does not write if the backup fails.
      </p>

      {editor.hasExternalChange && (
        <div class="squad-editor-warning" role="status">
          <i class="codicon codicon-warning" aria-hidden="true"></i>
          <span>This file changed on disk after you started editing.</span>
          <button class="squad-editor-button" onClick={editor.discardAndReload} disabled={editor.isSaving}>
            Discard draft &amp; reload
          </button>
        </div>
      )}

      <textarea
        class="squad-editor-textarea"
        aria-label={`Edit ${label}`}
        value={editor.draft}
        readOnly={editor.isSaving}
        spellcheck={false}
        rows={16}
        onInput={(event) => editor.updateDraft((event.currentTarget as HTMLTextAreaElement).value)}
        onKeyDown={onKeyDown}
      />

      <p class={`squad-editor-status${editor.isDirty ? " dirty" : ""}`} aria-live="polite">
        {editor.isSaving ? "Saving…" : editor.isDirty ? "Unsaved changes" : "No changes"}
      </p>

      {editor.saveError && (
        <div class="squad-editor-error">
          <SquadErrorNotice error={editor.saveError} />
          {editor.isConflict && (
            <button class="squad-editor-button" onClick={editor.discardAndReload}>
              <i class="codicon codicon-refresh" aria-hidden="true"></i> Discard draft &amp; reload latest
            </button>
          )}
        </div>
      )}

      {editor.isConfirmingDiscard ? (
        <div class="squad-editor-confirm" role="group" aria-label="Discard unsaved changes?">
          <span>Discard unsaved changes?</span>
          <button class="squad-editor-button squad-editor-danger" onClick={editor.confirmDiscard}>
            Discard
          </button>
          <button class="squad-editor-button" onClick={editor.keepEditing}>
            Keep editing
          </button>
        </div>
      ) : (
        <div class="squad-editor-actions">
          <button class="squad-editor-button squad-editor-primary" onClick={editor.save} disabled={!editor.canSave}>
            <i class="codicon codicon-save" aria-hidden="true"></i> {editor.isSaving ? "Saving…" : "Save"}
          </button>
          <button class="squad-editor-button" onClick={editor.cancel} disabled={editor.isSaving}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
