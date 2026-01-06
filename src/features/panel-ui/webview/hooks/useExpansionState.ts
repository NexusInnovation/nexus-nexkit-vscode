/**
 * Custom hook for managing persistent expansion state
 * Stores section expansion state in VS Code persistent storage
 */

import { useState, useEffect, useCallback } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { WebviewPersistentState } from "../types";

/**
 * Hook to manage expansion state for collapsible sections
 * State persists across panel reloads
 */
export function useExpansionState() {
  const messenger = useVSCodeAPI();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Initialize state from VS Code storage on mount
  useEffect(() => {
    const state = messenger.getState<WebviewPersistentState>();
    setExpandedSections(state?.expandedSections || {});
  }, [messenger]);

  // Sync state to VS Code storage whenever it changes
  useEffect(() => {
    const currentState = messenger.getState<WebviewPersistentState>() || { expandedSections: {} };
    currentState.expandedSections = expandedSections;
    messenger.setState(currentState);
  }, [expandedSections, messenger]);

  /**
   * Set expansion state for a specific section
   */
  const setSectionExpanded = useCallback(
    (repository: string, type: string, expanded: boolean) => {
      setExpandedSections((prev) => {
        const key = `${repository}::${type}`;
        return { ...prev, [key]: expanded };
      });
    },
    [messenger]
  );

  /**
   * Check if a section is expanded
   */
  const isSectionExpanded = useCallback(
    (repository: string, type: string): boolean => {
      const key = `${repository}::${type}`;
      return expandedSections[key] ?? false;
    },
    [expandedSections]
  );

  return { isSectionExpanded, setSectionExpanded };
}
