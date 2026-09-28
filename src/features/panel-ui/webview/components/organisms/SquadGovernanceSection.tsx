import { useSquadState } from "../../hooks/useSquadState";
import { SkeletonList } from "../atoms/Skeleton";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { SquadMarkdownView } from "../molecules/SquadMarkdownView";
import { SquadMarkdownDoc } from "../../../../squad/models";

interface SquadDocViewProps {
  label: string;
  fileName: string;
  doc: SquadMarkdownDoc | null;
}

/**
 * Renders a single governance document (decisions or routing) read-only,
 * showing an explicit empty state when the file is absent.
 */
function SquadDocView({ label, fileName, doc }: SquadDocViewProps) {
  if (!doc || !doc.exists) {
    return (
      <p class="empty-message">
        No <code>{fileName}</code> found in <code>.squad/</code>.
      </p>
    );
  }

  return <SquadMarkdownView content={doc.content} ariaLabel={label} emptyMessage={`${fileName} is empty.`} />;
}

/**
 * SquadGovernanceSection Component (SQD-013, FR-024)
 *
 * Read-only, purely presentational viewers for the Squad governance documents
 * `.squad/decisions.md` and `.squad/routing.md`, sourced from the Squad
 * AppState slice via {@link useSquadState}. Editing is out of scope for the MVP
 * (SQD-029). Loading, empty and error states are shown explicitly.
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
            <SquadDocView label="Squad decisions" fileName="decisions.md" doc={decisions} />
          </CollapsibleSection>

          <CollapsibleSection id="squad-routing" title="Routing">
            <SquadDocView label="Squad routing" fileName="routing.md" doc={routing} />
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
