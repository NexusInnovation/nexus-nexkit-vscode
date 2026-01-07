import { useState, useEffect } from "preact/hooks";
import { useWebviewPersistentState } from "./useWebviewPersistentState";

/**
 * Hook to manage expansion state for a specific collapsible section
 * State persists across panel reloads using a unique key
 *
 * @param key - Unique identifier for the section (e.g., "templates", "profiles", "repo::type")
 * @param defaultExpanded - Default expansion state if key is not in persistent storage (default: false)
 * @returns Tuple of [isExpanded, setIsExpanded]
 */
export function useExpansionState(key: string, defaultExpanded: boolean = false): [boolean, (expanded: boolean) => void] {
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();

  // Initialize state from VS Code storage or use default
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    return getWebviewState().expandedState?.[key] ?? defaultExpanded;
  });

  // Sync state to VS Code storage whenever it changes
  useEffect(() => {
    const currentState = getWebviewState();
    currentState.expandedState[key] = isExpanded;
    setWebviewState(currentState);
  }, [isExpanded, key]);

  return [isExpanded, setIsExpanded];
}
