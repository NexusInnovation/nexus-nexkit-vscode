/**
 * Selector hook for the Squad upstream management UI (SQD-040, FR-030/031/032).
 *
 * Derives the upstream view model from the centralized Squad slice and exposes
 * the `squad upstream` actions from {@link useSquadState}. Components stay
 * purely presentational; every side effect is a host message.
 */

import { useSquadState } from "./useSquadState";
import { SquadUpstreamOperation } from "../../../squad/models";
import type { SquadError, SquadUpstreamRecommendations, SquadUpstreamSource } from "../../../squad/models";
import type { SquadUpstreamOperationState } from "../types/squadState";
import { describeUpstreamOperation, type SquadOperationFeedback } from "../utils/squadUpstreamFormat";
import { isSquadPluginError } from "../utils/squadPluginFormat";

/** Hook result for the upstream management UI. */
export interface UseSquadUpstreamsResult {
  /** Whether the first Squad snapshot has been received. */
  isReady: boolean;

  /** Whether a full Squad refresh is in flight. */
  isLoading: boolean;

  /** Upstream sources read from `.squad/upstream.json`. */
  upstreams: SquadUpstreamSource[];

  /** Org → team → project recommendations, when evaluated. */
  recommendations: SquadUpstreamRecommendations | null;

  /** Latest upstream operation, or `null`. */
  operation: SquadUpstreamOperationState | null;

  /** True while an upstream operation is running (actions are disabled). */
  isBusy: boolean;

  /** Feedback for the latest operation (running / success / cancelled / error). */
  feedback: SquadOperationFeedback | null;

  /** Shared Squad error relevant to this section (plugin errors are excluded). */
  error: SquadError | null;

  /** Re-list upstreams through `squad upstream list`. */
  listUpstreams: () => void;

  /** Add a free local / git / export upstream (blank name/ref are omitted). */
  addUpstream: (source: string, name?: string, ref?: string) => void;

  /** Sync one upstream, or all when `name` is omitted. */
  syncUpstream: (name?: string) => void;

  /** Remove an upstream; the host confirms first. */
  removeUpstream: (name: string) => void;

  /** Re-run the last failed list/sync/remove operation, or `null` when not retryable. */
  retryOperation: (() => void) | null;
}

/** Trim an optional text field, mapping blanks to `undefined`. */
function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Hook to access the upstream management view model and actions.
 */
export function useSquadUpstreams(): UseSquadUpstreamsResult {
  const squad = useSquadState();
  const operation = squad.upstreamOperation;
  const feedback = describeUpstreamOperation(operation);

  const addUpstream = (source: string, name?: string, ref?: string) => {
    const trimmedSource = source.trim();
    if (!trimmedSource) {
      return;
    }
    squad.addUpstream(trimmedSource, optional(name), optional(ref));
  };

  let retryOperation: (() => void) | null = null;
  if (operation && feedback?.tone === "error") {
    const name = operation.name;
    switch (operation.operation) {
      case SquadUpstreamOperation.List:
        retryOperation = () => squad.listUpstreams();
        break;
      case SquadUpstreamOperation.Sync:
        retryOperation = () => squad.syncUpstream(name);
        break;
      case SquadUpstreamOperation.Remove:
        retryOperation = name ? () => squad.removeUpstream(name) : null;
        break;
      default:
        // A failed add keeps its form values, so the user resubmits from the form.
        retryOperation = null;
    }
  }

  return {
    isReady: squad.isReady,
    isLoading: squad.isLoading,
    upstreams: squad.upstreams,
    recommendations: squad.upstreamRecommendations,
    operation,
    isBusy: operation?.status === "running",
    feedback,
    error: isSquadPluginError(squad.error, squad.lastPluginAction) ? null : squad.error,
    listUpstreams: squad.listUpstreams,
    addUpstream,
    syncUpstream: squad.syncUpstream,
    removeUpstream: squad.removeUpstream,
    retryOperation,
  };
}
