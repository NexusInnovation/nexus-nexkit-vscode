/**
 * Hook for the workspace consult-mode scenario (SQD-052 / FR-064).
 *
 * Keeps UI components presentational: status, `squad consult` and
 * `squad extract` requests are sent through the centralized webview messenger
 * and host routing.
 */

import { useAppState } from "./useAppState";
import { useVSCodeAPI } from "./useVSCodeAPI";
import type { SquadConsultModeStateSlice } from "../types/squadState";

export interface UseSquadConsultModeResult extends SquadConsultModeStateSlice {
  /** Request a read-only consult-mode status refresh. */
  refresh: () => void;

  /** Request confirmed `squad consult`. */
  start: () => void;

  /** Request confirmed `squad extract`. */
  extract: () => void;
}

export function useSquadConsultMode(): UseSquadConsultModeResult {
  const { squad } = useAppState();
  const messenger = useVSCodeAPI();

  const refresh = () => {
    messenger.sendMessage({ command: "getConsultModeStatus" });
  };

  const start = () => {
    messenger.sendMessage({ command: "startSquadConsultMode" });
  };

  const extract = () => {
    messenger.sendMessage({ command: "extractSquadConsultMode" });
  };

  return {
    ...squad.consultMode,
    refresh,
    start,
    extract,
  };
}
