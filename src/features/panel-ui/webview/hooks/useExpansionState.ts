/**
 * Custom hook for managing persistent expansion state
 * Stores section expansion state in VS Code persistent storage
 */

import { useCallback } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { WebviewPersistentState } from "../types";

/**
 * Hook to manage expansion state for collapsible sections
 * State persists across panel reloads
 */
export function useExpansionState() {
  const messenger = useVSCodeAPI();

  /**
   * Get the current expansion state from VS Code storage
   */
  const getExpansionStates = useCallback((): Record<string, boolean> => {
    const state = messenger.getState<WebviewPersistentState>();
    return state?.expandedSections || {};
  }, [messenger]);

  /**
   * Set expansion state for a specific section
   */
  const setSectionExpanded = useCallback(
    (repository: string, type: string, expanded: boolean) => {
      const currentState = messenger.getState<WebviewPersistentState>() || {
        expandedSections: {},
      };
      const key = `${repository}::${type}`;
      currentState.expandedSections[key] = expanded;
      messenger.setState(currentState);
    },
    [messenger]
  );

  /**
   * Check if a section is expanded
   */
  const isSectionExpanded = useCallback(
    (repository: string, type: string): boolean => {
      const states = getExpansionStates();
      const key = `${repository}::${type}`;
      return states[key] ?? false;
    },
    [getExpansionStates]
  );

  return {
    getExpansionStates,
    setSectionExpanded,
    isSectionExpanded,
  };
}
