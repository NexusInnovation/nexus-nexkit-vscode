import { useState, useEffect } from "preact/hooks";
import { useWebviewPersistentState } from "./useWebviewPersistentState";

/**
 * Hook to manage the active tab selection with persistence across webview reloads.
 *
 * @param availableTabIds - The list of tab IDs currently visible (mode-dependent)
 * @returns Tuple of [activeTabId, setActiveTabId]
 */
export function useActiveTab(availableTabIds: string[]): [string, (tabId: string) => void] {
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();

  const [activeTab, setActiveTab] = useState<string>(() => {
    const stored = getWebviewState().activeTab;
    // If the stored tab is still available, use it; otherwise fall back to the first tab
    if (stored && availableTabIds.includes(stored)) {
      return stored;
    }
    return availableTabIds[0] ?? "";
  });

  // If available tabs change (e.g. mode switch) and current tab is no longer valid, reset
  useEffect(() => {
    if (availableTabIds.length > 0 && !availableTabIds.includes(activeTab)) {
      setActiveTab(availableTabIds[0]);
    }
  }, [availableTabIds, activeTab]);

  // Persist active tab to VS Code webview state
  useEffect(() => {
    const currentState = getWebviewState();
    setWebviewState({ ...currentState, activeTab });
  }, [activeTab]);

  return [activeTab, setActiveTab];
}
