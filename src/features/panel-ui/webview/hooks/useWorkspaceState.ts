/**
 * Custom hook for workspace state management
 * Manages workspace initialization status
 */

import { useState, useEffect } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { WorkspaceState } from "../types";

/**
 * Hook to manage workspace state (has workspace, is initialized)
 */
export function useWorkspaceState() {
  const messenger = useVSCodeAPI();
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    hasWorkspace: false,
    isInitialized: false,
  });

  useEffect(() => {
    // Listen for workspace state updates from extension
    const unsubscribe = messenger.onMessage("workspaceStateUpdate", (message) => {
      if (message.command === "workspaceStateUpdate") {
        setWorkspaceState({
          hasWorkspace: message.hasWorkspace,
          isInitialized: message.isInitialized,
        });
      }
    });

    return unsubscribe;
  }, [messenger]);

  /**
   * Trigger workspace initialization
   */
  const initializeWorkspace = () => {
    messenger.sendMessage({ command: "initWorkspace" });
  };

  /**
   * Trigger update of installed templates
   */
  const updateInstalledTemplates = () => {
    messenger.sendMessage({ command: "updateInstalledTemplates" });
  };

  return {
    workspaceState,
    initializeWorkspace,
    updateInstalledTemplates,
  };
}
