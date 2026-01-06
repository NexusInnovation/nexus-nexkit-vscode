/**
 * Custom hook for managing persistent filter state
 * Stores filter mode in VS Code persistent storage
 */

import { useState, useEffect, useCallback } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { WebviewPersistentState, FilterMode } from "../types";

/**
 * Hook to manage filter mode for template list
 * Always resets to "all" on load
 */
export function useFilterState() {
  const messenger = useVSCodeAPI();
  const [filterMode, setFilterModeState] = useState<FilterMode>("all");

  // Reset to "all" on mount
  useEffect(() => {
    setFilterModeState("all");
  }, []);

  // Sync state to VS Code storage whenever it changes
  useEffect(() => {
    const currentState = messenger.getState<WebviewPersistentState>() || {
      expandedSections: {},
      filterMode: "all",
    };
    currentState.filterMode = filterMode;
    messenger.setState(currentState);
  }, [filterMode, messenger]);

  /**
   * Set the filter mode
   */
  const setFilterMode = useCallback((mode: FilterMode) => {
    setFilterModeState(mode);
  }, []);

  return { filterMode, setFilterMode };
}
