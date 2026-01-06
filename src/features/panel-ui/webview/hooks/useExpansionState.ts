import { useState, useEffect } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { WebviewPersistentState } from "../types";

/**
 * Hook to manage expansion state for a specific collapsible section
 * State persists across panel reloads using a unique key
 *
 * @param key - Unique identifier for the section (e.g., "templates", "profiles", "repo::type")
 * @param defaultExpanded - Default expansion state if key is not in persistent storage (default: false)
 * @returns Tuple of [isExpanded, setIsExpanded]
 */
export function useExpansionState(key: string, defaultExpanded: boolean = false): [boolean, (expanded: boolean) => void] {
  const messenger = useVSCodeAPI();

  // Initialize state from VS Code storage or use default
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    const state = messenger.getState<WebviewPersistentState>();
    return state?.expandedState?.[key] ?? defaultExpanded;
  });

  // Sync state to VS Code storage whenever it changes
  useEffect(() => {
    const currentState = messenger.getState<WebviewPersistentState>() || { expandedState: {} };
    currentState.expandedState = currentState.expandedState || {};
    currentState.expandedState[key] = isExpanded;
    messenger.setState(currentState);
  }, [isExpanded, key, messenger]);

  return [isExpanded, setIsExpanded];
}
