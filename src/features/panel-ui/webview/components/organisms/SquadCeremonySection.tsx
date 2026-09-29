import { useEffect } from "preact/hooks";
import { useSquadState } from "../../hooks/useSquadState";
import { SkeletonList } from "../atoms/Skeleton";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import type { SquadCeremoniesDocument, SquadCeremony, SquadError } from "../../../../squad/models";
import type { SquadCeremonyActionState } from "../../types/squadState";

interface SquadCeremonyListProps {
  document: SquadCeremoniesDocument;
  runningCeremonyId: string | null;
  lastAction: SquadCeremonyActionState | null;
  onRun: (ceremonyId: string) => void;
  onOpenFile: () => void;
}

/** Pure ceremony list renderer for FR-055, exported for VNode-level tests. */
export function SquadCeremonyList({
  document,
  runningCeremonyId,
  lastAction,
  onRun,
  onOpenFile,
}: SquadCeremonyListProps) {
  if (!document.exists) {
    return (
      <div class="squad-ceremony-empty info-message">
        <p>
          <i class="codicon codicon-info" aria-hidden="true"></i> No <code>.squad/ceremonies.md</code> was found in
          this workspace.
        </p>
        <button class="squad-ceremony-secondary-button" onClick={onOpenFile}>
          <i class="codicon codicon-edit" aria-hidden="true"></i> Create or open ceremonies file
        </button>
      </div>
    );
  }

  if (document.ceremonies.length === 0) {
    return (
      <div class="squad-ceremony-empty info-message">
        <p>
          <i class="codicon codicon-info" aria-hidden="true"></i> No runnable ceremonies were parsed from{" "}
          <code>.squad/ceremonies.md</code>.
        </p>
        <button class="squad-ceremony-secondary-button" onClick={onOpenFile}>
          <i class="codicon codicon-edit" aria-hidden="true"></i> Edit ceremonies
        </button>
      </div>
    );
  }

  return (
    <div class="squad-ceremony-list">
      {document.truncated ? (
        <p class="squad-truncation-notice">
          <i class="codicon codicon-warning" aria-hidden="true"></i> This ceremonies file is large; NexKit parsed the
          first 256 KB. Open the file to review the full content.
        </p>
      ) : null}

      {document.ceremonies.map((ceremony) => (
        <SquadCeremonyCard
          key={ceremony.id}
          ceremony={ceremony}
          running={runningCeremonyId === ceremony.id}
          lastAction={lastAction?.ceremonyId === ceremony.id ? lastAction : null}
          onRun={() => onRun(ceremony.id)}
        />
      ))}
    </div>
  );
}

export function SquadCeremonyCard({
  ceremony,
  running,
  lastAction,
  onRun,
}: {
  ceremony: SquadCeremony;
  running: boolean;
  lastAction: SquadCeremonyActionState | null;
  onRun: () => void;
}) {
  const metadata = [
    ceremony.trigger ? `Trigger: ${ceremony.trigger}` : undefined,
    ceremony.when ? `When: ${ceremony.when}` : undefined,
    ceremony.facilitator ? `Facilitator: ${ceremony.facilitator}` : undefined,
    ceremony.timeBudget ? `Budget: ${ceremony.timeBudget}` : undefined,
  ].filter((item): item is string => item !== undefined);
  const disabled = !ceremony.enabled || running;

  return (
    <article class={`squad-ceremony-card${ceremony.enabled ? "" : " disabled"}`}>
      <div class="squad-ceremony-card-header">
        <div>
          <h4 class="squad-ceremony-name">{ceremony.name}</h4>
          {metadata.length > 0 ? <p class="squad-ceremony-meta">{metadata.join(" • ")}</p> : null}
        </div>
        <button
          class="squad-ceremony-run-button"
          onClick={onRun}
          disabled={disabled}
          title={ceremony.enabled ? `Run ${ceremony.name}` : "This ceremony is disabled in .squad/ceremonies.md"}
        >
          <i class={`codicon codicon-${running ? "loading codicon-modifier-spin" : "play"}`} aria-hidden="true"></i>{" "}
          {running ? "Starting…" : "Run"}
        </button>
      </div>

      {!ceremony.enabled ? <p class="squad-ceremony-disabled">Disabled in .squad/ceremonies.md</p> : null}
      {ceremony.participants ? <p class="squad-ceremony-participants">Participants: {ceremony.participants}</p> : null}
      {ceremony.agenda.length > 0 ? (
        <ol class="squad-ceremony-agenda">
          {ceremony.agenda.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      ) : (
        <p class="empty-message">No agenda items were found for this ceremony.</p>
      )}
      {lastAction?.status === "succeeded" ? (
        <p class="squad-ceremony-success">
          <i class="codicon codicon-pass" aria-hidden="true"></i> Started in Copilot Chat.
        </p>
      ) : null}
      {lastAction?.status === "failed" && lastAction.error ? <InlineError error={lastAction.error} /> : null}
    </article>
  );
}

function InlineError({ error }: { error: SquadError }) {
  return (
    <div class="squad-ceremony-inline-error">
      <SquadErrorNotice error={error} />
    </div>
  );
}

/**
 * SquadCeremonySection Component (SQD-047, FR-055)
 *
 * One-click ceremony actions sourced from `.squad/ceremonies.md`. The hook owns
 * all host communication; this component renders loading, actionable errors,
 * disabled ceremonies, and per-action outcomes explicitly.
 */
export function SquadCeremonySection() {
  const {
    ceremonies,
    ceremoniesLoading,
    ceremoniesError,
    runningCeremonyId,
    lastCeremonyAction,
    refreshCeremonies,
    runCeremony,
    openCeremonies,
  } = useSquadState();

  useEffect(() => {
    if (!ceremonies && !ceremoniesLoading) {
      refreshCeremonies();
    }
  }, []);

  return (
    <div class="squad-ceremonies">
      <div class="squad-ceremony-toolbar">
        <p class="squad-ceremony-intro">Run a team ceremony from the workspace Squad definition.</p>
        <div class="squad-ceremony-toolbar-actions">
          <button class="squad-refresh-button" onClick={refreshCeremonies} disabled={ceremoniesLoading}>
            <i
              class={`codicon codicon-refresh${ceremoniesLoading ? " codicon-modifier-spin" : ""}`}
              aria-hidden="true"
            ></i>{" "}
            Refresh
          </button>
          <button class="squad-ceremony-secondary-button" onClick={openCeremonies}>
            <i class="codicon codicon-edit" aria-hidden="true"></i> Open file
          </button>
        </div>
      </div>

      {ceremoniesError ? <SquadErrorNotice error={ceremoniesError} /> : null}
      {ceremoniesLoading && !ceremonies ? <SkeletonList label="Loading Squad ceremonies" rows={3} /> : null}
      {ceremoniesLoading && ceremonies ? <p class="loading">Refreshing ceremonies…</p> : null}
      {ceremonies ? (
        <SquadCeremonyList
          document={ceremonies}
          runningCeremonyId={runningCeremonyId}
          lastAction={lastCeremonyAction}
          onRun={runCeremony}
          onOpenFile={openCeremonies}
        />
      ) : null}
    </div>
  );
}
