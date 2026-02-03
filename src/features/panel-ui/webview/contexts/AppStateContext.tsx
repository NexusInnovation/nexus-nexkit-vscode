/**
 * Global Application State Context
 * Provides centralized state management for the entire webview application
 * Solves timing issues by capturing all messages at the root level before any child components mount
 */

import { createContext, ComponentChildren } from "preact";
import { useState, useEffect } from "preact/hooks";
import { AppState, initialAppState } from "../types/appState";
import { ExtensionMessage } from "../types";
import { useVSCodeAPI } from "../hooks/useVSCodeAPI";

/**
 * Context for global application state
 */
export const AppStateContext = createContext<AppState | null>(null);

/**
 * Props for AppStateProvider
 */
interface AppStateProviderProps {
  children: ComponentChildren;
}

/**
 * Global state provider component
 * Manages all application state and message handling in one place
 */
export function AppStateProvider({ children }: AppStateProviderProps) {
  const messenger = useVSCodeAPI();
  const [state, setState] = useState<AppState>(initialAppState);

  useEffect(() => {
    /**
     * Single centralized message handler for all extension messages
     * This ensures no messages are lost due to component mounting timing
     */
    const handleMessage = (message: ExtensionMessage) => {
      switch (message.command) {
        case "workspaceStateUpdate":
          setState((prev) => ({
            ...prev,
            workspace: {
              hasWorkspace: message.hasWorkspace,
              isInitialized: message.isInitialized,
              mode: message.mode,
              isReady: true,
            },
          }));
          break;

        case "templateDataUpdate":
          setState((prev) => ({
            ...prev,
            templates: {
              ...prev.templates,
              repositories: message.repositories,
              isReady: true,
            },
          }));
          break;

        case "installedTemplatesUpdate":
          setState((prev) => ({
            ...prev,
            templates: {
              ...prev.templates,
              installed: message.installed,
            },
          }));
          break;

        case "profilesUpdate":
          setState((prev) => ({
            ...prev,
            profiles: {
              list: message.profiles,
              isReady: true,
            },
          }));
          break;
      }
    };

    // Set up message listeners for all message types
    const unsubscribeWorkspace = messenger.onMessage("workspaceStateUpdate", handleMessage);
    const unsubscribeTemplateData = messenger.onMessage("templateDataUpdate", handleMessage);
    const unsubscribeInstalled = messenger.onMessage("installedTemplatesUpdate", handleMessage);
    const unsubscribeProfiles = messenger.onMessage("profilesUpdate", handleMessage);
    const unsubscribeMetadata = messenger.onMessage("templateMetadataResponse", handleMessage);

    // Request initial state from extension
    messenger.sendMessage({ command: "webviewReady" });

    // Cleanup all subscriptions on unmount
    return () => {
      unsubscribeWorkspace();
      unsubscribeTemplateData();
      unsubscribeInstalled();
      unsubscribeProfiles();
      unsubscribeMetadata();
    };
  }, [messenger]);

  return <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>;
}
