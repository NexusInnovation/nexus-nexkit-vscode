import { useVSCodeAPI } from "./useVSCodeAPI";
import { WebviewPersistentState } from "../types";
import { useCallback } from "preact/hooks";

const DEFAULT_STATE: WebviewPersistentState = {
  expandedState: {},
  filterMode: "all",
};

/**
 * Hook to manage the persistent state of the webview panel
 * State persists across panel reloads
 */
export function useWebviewPersistentState() {
  const messenger = useVSCodeAPI();

  const getWebviewState = useCallback((): WebviewPersistentState => {
    const storedState = messenger.getState<WebviewPersistentState>();
    // Merge DEFAULT_STATE with stored state to ensure all required properties exist
    // Stored values take precedence, but missing properties are filled from defaults
    return { ...DEFAULT_STATE, ...storedState };
  }, [messenger]);

  const setWebviewState = useCallback(
    (state: WebviewPersistentState) => {
      messenger.setState(state);
    },
    [messenger]
  );

  return {
    getWebviewState,
    setWebviewState,
  };
}
