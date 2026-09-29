/**
 * Pure helpers for the Squad upstream management UI (SQD-040, FR-030/031/032).
 *
 * Maps the latest `squad upstream` operation state onto user-facing feedback.
 * Free of Preact and `vscode` imports so they stay trivially unit-testable.
 */

import { SquadUpstreamOperation } from "../../../squad/models";
import type { SquadError } from "../../../squad/models";
import type { SquadUpstreamOperationState } from "../types/squadState";

/** Visual tone of an operation feedback line. */
export type SquadOperationTone = "running" | "success" | "cancelled" | "error";

/** User-facing feedback for the latest upstream or plugin operation. */
export interface SquadOperationFeedback {
  /** Visual tone; `error` is always rendered as an actionable alert. */
  tone: SquadOperationTone;

  /** One-line summary of the operation state. */
  message: string;

  /** Actionable error for `error` / `cancelled` tones, otherwise `null`. */
  error: SquadError | null;
}

/** Whether an error represents a user cancellation (nothing changed). */
export function isCancelledError(error: SquadError | null | undefined): boolean {
  return error?.code === "cancelled";
}

function quoted(name: string | undefined): string {
  return name ? ` "${name}"` : "";
}

function runningMessage(operation: SquadUpstreamOperation, name: string | undefined): string {
  switch (operation) {
    case SquadUpstreamOperation.List:
      return "Listing upstreams…";
    case SquadUpstreamOperation.Add:
      return `Adding upstream${quoted(name)}…`;
    case SquadUpstreamOperation.Sync:
      return name ? `Syncing upstream "${name}"…` : "Syncing all upstreams…";
    case SquadUpstreamOperation.Remove:
      return `Removing upstream${quoted(name)}…`;
  }
}

function successMessage(operation: SquadUpstreamOperation, name: string | undefined): string {
  switch (operation) {
    case SquadUpstreamOperation.List:
      return "Upstream list refreshed.";
    case SquadUpstreamOperation.Add:
      return `Upstream${quoted(name)} added.`;
    case SquadUpstreamOperation.Sync:
      return name ? `Upstream "${name}" synced.` : "All upstreams synced.";
    case SquadUpstreamOperation.Remove:
      return `Upstream${quoted(name)} removed.`;
  }
}

function failureMessage(operation: SquadUpstreamOperation, name: string | undefined): string {
  switch (operation) {
    case SquadUpstreamOperation.List:
      return "Listing upstreams failed.";
    case SquadUpstreamOperation.Add:
      return `Adding upstream${quoted(name)} failed.`;
    case SquadUpstreamOperation.Sync:
      return name ? `Syncing upstream "${name}" failed.` : "Syncing upstreams failed.";
    case SquadUpstreamOperation.Remove:
      return `Removing upstream${quoted(name)} failed.`;
  }
}

/**
 * Describe the latest upstream operation. A failure never maps to a success
 * tone; a user cancellation maps to `cancelled` (nothing changed).
 */
export function describeUpstreamOperation(operation: SquadUpstreamOperationState | null): SquadOperationFeedback | null {
  if (!operation) {
    return null;
  }

  switch (operation.status) {
    case "running":
      return { tone: "running", message: runningMessage(operation.operation, operation.name), error: null };
    case "succeeded":
      return { tone: "success", message: successMessage(operation.operation, operation.name), error: null };
    case "failed": {
      const error: SquadError = operation.error ?? {
        code: "upstream-failed",
        message: "The Squad upstream operation failed.",
        remediation: "Check the Nexkit output channel for details and try again.",
      };
      if (isCancelledError(error)) {
        return { tone: "cancelled", message: error.message, error };
      }
      return { tone: "error", message: failureMessage(operation.operation, operation.name), error };
    }
  }
}
