import { useSquadState } from "../../hooks/useSquadState";
import { SkeletonList } from "../atoms/Skeleton";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { SquadUpstreamRecommendationsView } from "../molecules/SquadUpstreamRecommendationsView";
import { SquadUpstreamKind, SquadUpstreamSource } from "../../../../squad/models";

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
}

/**
 * Pure upstream list/table renderer for FR-030. Exported so unit tests can
 * assert display behaviour without a DOM or hook harness.
 */
export function SquadUpstreamList({ upstreams }: SquadUpstreamListProps) {
  if (upstreams.length === 0) {
    return (
      <p class="empty-message">
        No upstream sources configured in <code>.squad/upstream.json</code>.
      </p>
    );
  }

  return (
    <table class="squad-upstream-table">
      <thead>
        <tr>
          <th scope="col">Source</th>
          <th scope="col">Type</th>
          <th scope="col">Reference</th>
          <th scope="col">Last sync</th>
        </tr>
      </thead>
      <tbody>
        {upstreams.map((upstream) => (
          <tr key={upstream.id}>
            <td class="squad-upstream-id">{upstream.id}</td>
            <td>
              <span class={`squad-upstream-kind squad-upstream-kind-${upstream.kind}`}>
                {UPSTREAM_KIND_LABEL[upstream.kind]}
              </span>
            </td>
            <td>
              <code class="squad-upstream-reference">{upstream.reference}</code>
            </td>
            <td>{formatUpstreamLastSyncedAt(upstream.lastSyncedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * SquadUpstreamSection Component (SQD-035, FR-030)
 *
 * Read-only display for `.squad/upstream.json`: source ids, types, references
 * and last sync timestamps. State is sourced from the centralized Squad slice;
 * failures from the host remain visible through {@link SquadErrorNotice}.
 */
export function SquadUpstreamSection() {
  const { isReady, isLoading, error, upstreams, upstreamRecommendations } = useSquadState();

  return (
    <div class="squad-upstreams">
      {error && <SquadErrorNotice error={error} />}

      {!isReady && !error && <SkeletonList label="Loading upstream sources" rows={3} />}

      {isReady && isLoading && <p class="loading">Refreshing upstream sources…</p>}

      {isReady && <SquadUpstreamList upstreams={upstreams} />}

      {isReady && upstreamRecommendations && <SquadUpstreamRecommendationsView recommendations={upstreamRecommendations} />}
    </div>
  );
}
