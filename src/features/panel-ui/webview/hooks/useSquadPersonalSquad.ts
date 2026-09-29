/**
 * Hook for the personal/global Squad scenario (SQD-051 / FR-064).
 *
 * Keeps the UI presentational: status reads and `squad init --global` requests
 * are sent through the centralized webview messenger and host routing.
 */

import { useAppState } from "./useAppState";
import { useVSCodeAPI } from "./useVSCodeAPI";
import type { SquadError, SquadPersonalSquadStatus } from "../../../squad/models";

export interface UseSquadPersonalSquadResult {
  /** True while status/init is in flight. */
  loading: boolean;

  /** Last known status, or null before the first status read. */
  status: SquadPersonalSquadStatus | null;

  /** Last personal Squad failure, if any. */
  error: SquadError | null;

  /** Whether the latest init request succeeded. */
  lastInitOk: boolean | null;

  /** Request a read-only status refresh. */
  refresh: () => void;

  /** Request confirmed personal Squad initialization. */
  initialize: () => void;
}

export function useSquadPersonalSquad(): UseSquadPersonalSquadResult {
  const { squad } = useAppState();
  const messenger = useVSCodeAPI();

  const refresh = () => {
    messenger.sendMessage({ command: "getPersonalSquadStatus" });
  };

  const initialize = () => {
    messenger.sendMessage({ command: "initPersonalSquad" });
  };

  return {
    loading: squad.personalSquad.loading,
    status: squad.personalSquad.status,
    error: squad.personalSquad.error,
    lastInitOk: squad.personalSquad.lastInitOk,
    refresh,
    initialize,
  };
}
