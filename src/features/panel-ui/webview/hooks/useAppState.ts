/**
 * Hook to access global application state
 * Provides type-safe access to the centralized state managed by AppStateContext
 */

import { useContext } from "preact/hooks";
import { AppStateContext } from "../contexts/AppStateContext";
import { AppState } from "../types/appState";

/**
 * Access the global application state
 * Must be used within an AppStateProvider
 *
 * @throws {Error} If used outside of AppStateProvider
 * @returns {AppState} The current application state
 */
export function useAppState(): AppState {
  const context = useContext(AppStateContext);

  if (context === null) {
    throw new Error("useAppState must be used within AppStateProvider");
  }

  return context;
}
