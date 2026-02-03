/**
 * Custom hook for accessing mode state
 * Provides convenient selectors and computed properties for operation mode
 */

import { useAppState } from "./useAppState";

/**
 * Mode hook result
 */
export interface UseModeResult {
  /**
   * Current operation mode
   */
  mode: string;

  /**
   * Whether current mode is Developers
   */
  isDevelopersMode: boolean;

  /**
   * Whether current mode is APM
   */
  isAPMMode: boolean;
}

/**
 * Hook to access mode state and computed properties
 */
export function useMode(): UseModeResult {
  const { workspace } = useAppState();
  const mode = workspace.mode;

  return {
    mode,
    isDevelopersMode: mode === "Developers",
    isAPMMode: mode === "APM",
  };
}
