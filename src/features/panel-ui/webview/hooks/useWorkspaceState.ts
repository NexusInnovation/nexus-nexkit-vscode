import { useState, useEffect } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { WorkspaceState } from "../types";

/**
 * Hook to manage workspace state (has workspace, is initialized)
 */
export function useWorkspaceState() {
  const messenger = useVSCodeAPI();
  const [isReady, setIsReady] = useState(false);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    hasWorkspace: false,
    isInitialized: false,
  });

  useEffect(() => {
    // Listen for workspace state updates from extension
    const unsubscribe = messenger.onMessage("workspaceStateUpdate", (message) => {
      if (message.command !== "workspaceStateUpdate") return;
      setIsReady(true);
      setWorkspaceState({
        hasWorkspace: message.hasWorkspace,
        isInitialized: message.isInitialized,
      });
    });

    return unsubscribe;
  }, [messenger]);

  return {
    isReady,
    workspaceState,
  };
}
