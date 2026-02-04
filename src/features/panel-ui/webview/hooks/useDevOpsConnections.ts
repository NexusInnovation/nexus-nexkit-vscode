/**
 * Custom hook for accessing DevOps connections state and actions
 * Provides convenient selectors and action functions for APM DevOps connection management
 */

import { useAppState } from "./useAppState";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { DevOpsConnection } from "../../../apm-devops/models/devOpsConnection";

/**
 * Hook result for DevOps connections
 */
export interface UseDevOpsConnectionsResult {
  /**
   * List of all configured DevOps connections
   */
  connections: DevOpsConnection[];

  /**
   * The currently active connection (or null if none)
   */
  activeConnection: DevOpsConnection | null;

  /**
   * Whether the connections have been loaded
   */
  isReady: boolean;

  /**
   * Error message if any operation failed
   */
  error?: string;

  /**
   * Add a new DevOps connection from a URL
   */
  addConnection: (url: string) => void;

  /**
   * Remove a DevOps connection
   */
  removeConnection: (connectionId: string) => void;

  /**
   * Set a connection as active
   */
  setActiveConnection: (connectionId: string) => void;

  /**
   * Refresh the connections list
   */
  refresh: () => void;

  /**
   * Clear any error message
   */
  clearError: () => void;
}

/**
 * Hook to access DevOps connections state and actions
 */
export function useDevOpsConnections(): UseDevOpsConnectionsResult {
  const { devOpsConnections } = useAppState();
  const messenger = useVSCodeAPI();

  const activeConnection = devOpsConnections.list.find((c) => c.isActive) || null;

  const addConnection = (url: string) => {
    messenger.sendMessage({ command: "addDevOpsConnection", url });
  };

  const removeConnection = (connectionId: string) => {
    messenger.sendMessage({ command: "removeDevOpsConnection", connectionId });
  };

  const setActiveConnection = (connectionId: string) => {
    messenger.sendMessage({ command: "setActiveDevOpsConnection", connectionId });
  };

  const refresh = () => {
    messenger.sendMessage({ command: "getDevOpsConnections" });
  };

  const clearError = () => {
    // Error is automatically cleared on next successful operation
    // This is handled by the AppStateContext
  };

  return {
    connections: devOpsConnections.list,
    activeConnection,
    isReady: devOpsConnections.isReady,
    error: devOpsConnections.error,
    addConnection,
    removeConnection,
    setActiveConnection,
    refresh,
    clearError,
  };
}
