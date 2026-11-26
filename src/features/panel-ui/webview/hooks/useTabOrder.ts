import { useCallback, useMemo, useState } from "preact/hooks";
import { useWebviewPersistentState } from "./useWebviewPersistentState";
import { applyTabOrder } from "../utils/tabOrder";

/**
 * Hook to manage the user-defined tab order, persisted in the webview state.
 *
 * @param defaultIds - Tab ids available for the current mode, in their default order
 * @returns The ordered tab ids and a setter that stores a new order
 */
export function useTabOrder(defaultIds: string[]): [string[], (order: string[]) => void] {
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();
  const [stored, setStored] = useState<string[] | undefined>(() => getWebviewState().tabOrder);

  // The key stands in for the array identity, which the caller may recreate on every render
  const defaultKey = defaultIds.join("|");
  const order = useMemo(() => applyTabOrder(defaultIds, stored), [defaultKey, stored]);

  const setOrder = useCallback(
    (next: string[]) => {
      // Merge with ids hidden in the current mode so their position survives a mode switch
      const hidden = (stored ?? []).filter((id) => !next.includes(id));
      const merged = [...next, ...hidden];
      setStored(merged);
      setWebviewState({ ...getWebviewState(), tabOrder: merged });
    },
    [stored, getWebviewState, setWebviewState]
  );

  return [order, setOrder];
}
