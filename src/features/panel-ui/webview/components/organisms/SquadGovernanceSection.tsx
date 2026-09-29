import { useSquadState } from "../../hooks/useSquadState";
import { useSquadEditor } from "../../hooks/useSquadEditor";
import { SkeletonList } from "../atoms/Skeleton";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { SquadFileEditor } from "../molecules/SquadFileEditor";
import { SquadMarkdownView } from "../molecules/SquadMarkdownView";
import { SquadDocKind, SquadMarkdownDoc } from "../../../../squad/models";

interface SquadDocEditorProps {
  label: string;
  fileName: string;
  kind: SquadDocKind;
  doc: SquadMarkdownDoc | null;
}

/**
 * Renders a single governance document (decisions or routing) with its
 * edit/save/cancel flow (SQD-029). An absent file shows an explicit empty
 * state and can be created; a missing document snapshot is read-only.
 */
function SquadDocEditor({ label, fileName, kind, doc }: SquadDocEditorProps) {
  const editor = useSquadEditor({
    target: { type: "doc", kind },
    content: doc?.exists ? doc.content : "",
    contentHash: doc?.contentHash,
    truncated: doc?.truncated,
  });

  if (!doc) {
    return (
      <p class="empty-message">
        No <code>{fileName}</code> found in <code>.squad/</code>.
      </p>
    );
  }

  return (
    <SquadFileEditor
      label={fileName}
      relativePath={doc.relativePath}
      editor={editor}
      editLabel={doc.exists ? "Edit" : "Create"}
    >
      {doc.exists ? (
        <SquadMarkdownView content={doc.content} ariaLabel={label} emptyMessage={`${fileName} is empty.`} />
      ) : (
        <p class="empty-message">
          No <code>{fileName}</code> found in <code>.squad/</code>.
        </p>
      )}
    </SquadFileEditor>
  );
}

/**
 * SquadGovernanceSection Component (SQD-013 / SQD-029, FR-024)
 *
 * Viewers and editors for the Squad governance documents `.squad/decisions.md`
 * and `.squad/routing.md`, sourced from the Squad AppState slice via
 * {@link useSquadState}. Edits are saved through the backup-first host write
 * path with optimistic concurrency (SQD-027). Loading, empty and error states
 * are shown explicitly.
 */
export function SquadGovernanceSection() {
  const { isReady, isLoading, error, decisions, routing } = useSquadState();

  return (
    <div class="squad-governance">
      {error && <SquadErrorNotice error={error} />}

      {!isReady && !error && <SkeletonList label="Loading governance documents" rows={3} />}

      {isReady && isLoading && <p class="loading">Refreshing governance documents…</p>}

      {isReady && (
        <>
          <CollapsibleSection id="squad-decisions" title="Decisions" defaultExpanded>
            <SquadDocEditor label="Squad decisions" fileName="decisions.md" kind="decisions" doc={decisions} />
          </CollapsibleSection>

          <CollapsibleSection id="squad-routing" title="Routing">
            <SquadDocEditor label="Squad routing" fileName="routing.md" kind="routing" doc={routing} />
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}