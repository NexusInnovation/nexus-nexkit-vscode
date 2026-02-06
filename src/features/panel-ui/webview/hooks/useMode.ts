/**
 * Custom hook for accessing mode state
 * Provides convenient selectors and computed properties for operation mode
 */

import { useAppState } from "./useAppState";
import { OperationMode } from "../../../ai-template-files/models/aiTemplateFile";

/**
 * Mode hook result
 */
export interface UseModeResult {
  /**
   * Current operation mode
   */
  mode: OperationMode;

  /**
   * Whether current mode is None (not selected yet)
   */
  isNoneMode: boolean;

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
    isNoneMode: mode === OperationMode.None,
    isDevelopersMode: mode === OperationMode.Developers,
    isAPMMode: mode === OperationMode.APM,
  };
}
