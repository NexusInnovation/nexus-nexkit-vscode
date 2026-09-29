import { useEffect, useState } from "preact/hooks";
import { useSquadUpstreams } from "../../hooks/useSquadUpstreams";
import { SkeletonList } from "../atoms/Skeleton";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { SquadOperationFeedbackView } from "../molecules/SquadOperationFeedback";
import { SquadUpstreamRecommendationsView } from "../molecules/SquadUpstreamRecommendationsView";
import { SquadUpstreamKind, SquadUpstreamOperation, SquadUpstreamSource } from "../../../../squad/models";
import type { SquadUpstreamOperationState } from "../../types/squadState";

/** Human-readable labels for upstream source kinds (FR-030). */
const UPSTREAM_KIND_LABEL: Record<SquadUpstreamKind, string> = {
  [SquadUpstreamKind.Local]: "Local",
  [SquadUpstreamKind.Git]: "Git",
  [SquadUpstreamKind.Export]: "Export",
};

/** Format the last sync timestamp for display, keeping unknown values explicit. */
export function formatUpstreamLastSyncedAt(lastSyncedAt: number | undefined): string {
  if (lastSyncedAt === undefined) {
    return "Never synced";
  }

  return new Date(lastSyncedAt).toLocaleString();
}

interface SquadUpstreamListProps {
  /** Upstream inheritance sources read from `.squad/upstream.json`. */
  upstreams: SquadUpstreamSource[];

  /** Sync a single upstream (FR-032). Renders the actions column when provided. */
  onSync?: (name: string) => void;

  /** Remove an upstream after host confirmation (FR-032). */
  onRemove?: (name: string) => void;

  /** Disables row actions while an operation runs. */
  disabled?: boolean;
}

/**
 * Pure upstream list/table renderer for FR-030 (plus FR-032 row actions when
 * handlers are supplied). Exported so tests can assert display behaviour
 * without a hook harness.
 */
export function SquadUpstreamList({ upstreams, onSync, onRemove, disabled }: SquadUpstreamListProps) {
  if (upstreams.length === 0) {
    return (
      <p class="empty-message">
        No upstream sources configured in <code>.squad/upstream.json</code>.
      </p>
    );
  }

  const hasActions = Boolean(onSync || onRemove);

  return (
    <table class="squad-upstream-table">
      <thead>
        <tr>
          <th scope="col">Source</th>
          <th scope="col">Type</th>
          <th scope="col">Reference</th>
          <th scope="col">Last sync</th>
          {hasActions && <th scope="col">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {upstreams.map((upstream) => (
          <tr key={upstream.id} data-upstream={upstream.id}>
            <td class="squad-upstream-id">{upstream.id}</td>
            <td>
              <span class={`squad-upstream-kind squad-upstream-kind-${upstream.kind}`}>{UPSTREAM_KIND_LABEL[upstream.kind]}</span>
            </td>
            <td>
              <code class="squad-upstream-reference">{upstream.reference}</code>
              {upstream.gitRef && <span class="squad-upstream-git-ref"> @ {upstream.gitRef}</span>}
            </td>
            <td>{formatUpstreamLastSyncedAt(upstream.lastSyncedAt)}</td>
            {hasActions && (
              <td class="squad-upstream-actions">
                {onSync && (
                  <button
                    class="squad-icon-button"
                    onClick={() => onSync(upstream.id)}
                    disabled={disabled}
                    title={`Sync upstream "${upstream.id}"`}
                    aria-label={`Sync upstream ${upstream.id}`}
                  >
                    <i class="codicon codicon-sync" aria-hidden="true"></i>
                  </button>
                )}
                {onRemove && (
                  <button
                    class="squad-icon-button squad-danger"
                    onClick={() => onRemove(upstream.id)}
                    disabled={disabled}
                    title={`Remove upstream "${upstream.id}" (asks for confirmation)`}
                    aria-label={`Remove upstream ${upstream.id}`}
                  >
                    <i class="codicon codicon-trash" aria-hidden="true"></i>
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface SquadUpstreamAddFormProps {
  /** Submit a new upstream (FR-031). */
  onAdd: (source: string, name?: string, ref?: string) => void;

  /** Disables the form while an operation runs. */
  disabled: boolean;

  /** The latest add operation when it succeeded; clears the form when it changes. */
  succeededAdd: SquadUpstreamOperationState | null;
}

/**
 * Form for `squad upstream add <source> [--name] [--ref]` (FR-031). Holds only
 * transient input state; values stay after a failure so the user can fix and
 * resubmit, and are cleared once the add succeeded.
 */
export function SquadUpstreamAddForm({ onAdd, disabled, succeededAdd }: SquadUpstreamAddFormProps) {
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");

  useEffect(() => {
    if (succeededAdd) {
      setSource("");
      setName("");
      setRef("");
    }
  }, [succeededAdd]);

  const canSubmit = !disabled && source.trim() !== "";

  const submit = (event: Event) => {
    event.preventDefault();
    if (canSubmit) {
      onAdd(source, name, ref);
    }
  };

  return (
    <form class="squad-upstream-add" onSubmit={submit}>
      <h4 class="squad-subsection-title">Add an upstream</h4>
      <p class="squad-upstream-add-hint">
        Use a local folder, a git repository or a JSON export. Git upstreams clone the whole repository — sub-paths are not
        supported.
      </p>
      <label class="squad-field">
        <span class="squad-field-label">Source</span>
        <input
          class="squad-upstream-source-input"
          type="text"
          value={source}
          placeholder="../org-squad, https://github.com/org/squad.git or export.json"
          aria-label="Upstream source"
          disabled={disabled}
          onInput={(event) => setSource((event.target as HTMLInputElement).value)}
        />
      </label>
      <label class="squad-field">
        <span class="squad-field-label">Name (optional)</span>
        <input
          class="squad-upstream-name-input"
          type="text"
          value={name}
          placeholder="Derived from the source when empty"
          aria-label="Upstream name"
          disabled={disabled}
          onInput={(event) => setName((event.target as HTMLInputElement).value)}
        />
      </label>
      <label class="squad-field">
        <span class="squad-field-label">Git ref (optional)</span>
        <input
          class="squad-upstream-ref-input"
          type="text"
          value={ref}
          placeholder="Branch or tag (git sources only)"
          aria-label="Upstream git ref"
          disabled={disabled}
          onInput={(event) => setRef((event.target as HTMLInputElement).value)}
        />
      </label>
      <button type="submit" class="squad-upstream-add-button" disabled={!canSubmit}>
        <i class="codicon codicon-add" aria-hidden="true"></i> Add upstream
      </button>
    </form>
  );
}

/**
 * SquadUpstreamSection Component (SQD-035 / SQD-040, FR-030/FR-031/FR-032)
 *
 * Displays `.squad/upstream.json` (ids, types, references, last sync) and lets
 * the user add, sync, re-list and remove upstreams through the Squad CLI. The
 * host confirms removals; every failure stays visible and actionable and never
 * renders as a success. Purely presentational: state and actions come from
 * {@link useSquadUpstreams}.
 */
export function SquadUpstreamSection() {
  const {
    isReady,
    isLoading,
    error,
    upstreams,
    recommendations,
    operation,
    isBusy,
    feedback,
    listUpstreams,
    addUpstream,
    syncUpstream,
    removeUpstream,
    retryOperation,
  } = useSquadUpstreams();

  const succeededAdd =
    operation && operation.operation === SquadUpstreamOperation.Add && operation.status === "succeeded" ? operation : null;

  return (
    <div class="squad-upstreams">
      {error && <SquadErrorNotice error={error} />}

      {!isReady && !error && <SkeletonList label="Loading upstream sources" rows={3} />}

      {isReady && isLoading && <p class="loading">Refreshing upstream sources…</p>}

      {isReady && (
        <>
          <div class="squad-toolbar">
            <button
              class="squad-toolbar-button"
              onClick={() => syncUpstream()}
              disabled={isBusy || upstreams.length === 0}
              title="Sync every upstream (squad upstream sync)"
            >
              <i class="codicon codicon-sync" aria-hidden="true"></i> Sync all
            </button>
            <button
              class="squad-toolbar-button"
              onClick={listUpstreams}
              disabled={isBusy}
              title="Re-list upstreams (squad upstream list)"
            >
              <i class="codicon codicon-refresh" aria-hidden="true"></i> Refresh list
            </button>
          </div>

          {feedback && <SquadOperationFeedbackView feedback={feedback} onRetry={retryOperation} disabled={isBusy} />}

          <SquadUpstreamList upstreams={upstreams} onSync={syncUpstream} onRemove={removeUpstream} disabled={isBusy} />

          <SquadUpstreamAddForm onAdd={addUpstream} disabled={isBusy} succeededAdd={succeededAdd} />
        </>
      )}

      {isReady && recommendations && <SquadUpstreamRecommendationsView recommendations={recommendations} />}
    </div>
  );
}
