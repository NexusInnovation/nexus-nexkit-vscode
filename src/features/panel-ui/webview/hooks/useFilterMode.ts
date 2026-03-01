import { useState, useEffect } from "preact/hooks";
import { FilterMode, GroupMode, WebviewPersistentState } from "../types";
import { useWebviewPersistentState } from "./useWebviewPersistentState";

/**
 * Hook to manage filter mode for template list (persisted in VS Code storage)
 *
 * @returns Tuple of [filterMode, setFilterMode]
 */
export function useFilterMode(): [FilterMode, (mode: FilterMode) => void] {
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();

  // Initialize state from VS Code storage or use default
  const [filterMode, setFilterMode] = useState<FilterMode>(() => {
    return getWebviewState().filterMode;
  });

  // Sync state to VS Code storage whenever it changes
  useEffect(() => {
    const currentState = getWebviewState();
    currentState.filterMode = filterMode;
    setWebviewState(currentState);
  }, [filterMode]);

  return [filterMode, setFilterMode];
}

/**
 * Hook to manage group mode for template list (persisted in VS Code storage)
 */
export function useGroupMode(): [GroupMode, (mode: GroupMode) => void] {
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();

  const [groupMode, setGroupMode] = useState<GroupMode>(() => {
    return getWebviewState().groupMode ?? "type";
  });

  useEffect(() => {
    const currentState = getWebviewState();
    currentState.groupMode = groupMode;
    setWebviewState(currentState);
  }, [groupMode]);

  return [groupMode, setGroupMode];
}

/**
 * Hook to manage "selected first" toggle (persisted in VS Code storage)
 */
export function useSelectedFirst(): [boolean, (value: boolean) => void] {
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();

  const [selectedFirst, setSelectedFirst] = useState<boolean>(() => {
    return getWebviewState().selectedFirst ?? true;
  });

  useEffect(() => {
    const currentState = getWebviewState();
    currentState.selectedFirst = selectedFirst;
    setWebviewState(currentState);
  }, [selectedFirst]);

  return [selectedFirst, setSelectedFirst];
}

/**
 * Hook to manage type filters (persisted in VS Code storage)
 * Empty array means "show all types"
 */
export function useTypeFilters(): [string[], (types: string[]) => void] {
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();

  const [typeFilters, setTypeFilters] = useState<string[]>(() => {
    return getWebviewState().typeFilters ?? [];
  });

  useEffect(() => {
    const currentState = getWebviewState();
    currentState.typeFilters = typeFilters;
    setWebviewState(currentState);
  }, [typeFilters]);

  return [typeFilters, setTypeFilters];
}

/**
 * Hook to manage repository filters (persisted in VS Code storage)
 * Empty array means "show all repositories"
 */
export function useRepositoryFilters(): [string[], (repos: string[]) => void] {
  const { getWebviewState, setWebviewState } = useWebviewPersistentState();

  const [repositoryFilters, setRepositoryFilters] = useState<string[]>(() => {
    return getWebviewState().repositoryFilters ?? [];
  });

  useEffect(() => {
    const currentState = getWebviewState();
    currentState.repositoryFilters = repositoryFilters;
    setWebviewState(currentState);
  }, [repositoryFilters]);

  return [repositoryFilters, setRepositoryFilters];
}
