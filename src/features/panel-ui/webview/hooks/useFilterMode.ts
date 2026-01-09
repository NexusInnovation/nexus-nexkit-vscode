import { useState, useEffect } from "preact/hooks";
import { FilterMode, WebviewPersistentState } from "../types";
import { useWebviewPersistentState } from "./useWebviewPersistentState";

/**
 * Hook to manage filter mode for template list (persisted in VS Code storage)
 *
 * @returns Tuple of [filterMode, setFilterMode]
 */
export function useFilterMode(): [FilterMode, (mode: FilterMode) => void] {
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();

  // Initialize state from VS Code storage or use default
  const [filterMode, setFilterMode] = useState<FilterMode>(() => {
    return getWebviewState().filterMode;
  });

  // Sync state to VS Code storage whenever it changes
  useEffect(() => {
    const currentState = getWebviewState();
    currentState.filterMode = filterMode;
    setWebviewState(currentState);
  }, [filterMode]);

  return [filterMode, setFilterMode];
}
