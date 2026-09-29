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
              isInitRefused: message.isInitRefused,
              mode: message.mode,
              deployMode: message.deployMode,
              workspaceOverrideActive: message.workspaceOverrideActive,
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

        case "devOpsConnectionsUpdate":
          setState((prev) => ({
            ...prev,
            devOpsConnections: {
              list: message.connections,
              isReady: true,
              error: undefined,
            },
          }));
          break;

        case "devOpsConnectionError":
          setState((prev) => ({
            ...prev,
            devOpsConnections: {
              ...prev.devOpsConnections,
              error: message.error,
            },
          }));
          break;

        case "metadataScanProgress":
          setState((prev) => ({
            ...prev,
            metadataScan: {
              ...prev.metadataScan,
              isScanning: message.progress.isScanning,
              scannedCount: message.progress.scannedCount,
              totalCount: message.progress.totalCount,
            },
          }));
          break;

        case "metadataScanComplete":
          setState((prev) => ({
            ...prev,
            metadataScan: {
              isScanning: false,
              scannedCount: prev.metadataScan.totalCount,
              totalCount: prev.metadataScan.totalCount,
              isComplete: true,
              index: message.index,
            },
          }));
          break;

        case "workflowListUpdate":
          setState((prev) => ({
            ...prev,
            workflows: {
              list: message.workflows,
              isReady: true,
            },
          }));
          break;

        case "templateUpdatesAvailable":
          setState((prev) => ({
            ...prev,
            templates: {
              ...prev.templates,
              updatesAvailable: message.updatesAvailable,
            },
          }));
          break;

        case "squadStatusUpdate":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              detection: message.detection,
              upstreams: message.upstreams,
              upstreamRecommendations: message.upstreamRecommendations ?? null,
              marketplaces: message.marketplaces,
              plugins: message.plugins,
              isReady: true,
              isLoading: false,
              error: null,
            },
          }));
          break;

        case "squadPluginsUpdate":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              marketplaces: message.marketplaces,
              plugins: message.plugins,
              isLoading: false,
              error: null,
            },
          }));
          break;

        case "squadPluginActionResult":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              lastPluginAction: {
                action: message.action,
                target: message.target,
                ok: message.ok,
                changed: message.changed,
                output: message.output,
                error: message.error,
              },
            },
          }));
          break;

        case "squadRosterUpdate":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              roster: message.roster,
              charters: message.charters,
            },
          }));
          break;

        case "squadDocsUpdate":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              decisions: message.decisions,
              routing: message.routing,
            },
          }));
          break;

        case "squadLogsUpdate":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              logs: message.logs,
            },
          }));
          break;

        case "squadDoctorUpdate":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              doctor: message.doctor,
              isLoading: false,
            },
          }));
          break;

        case "squadUpdatesUpdate":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              updates: message.updates,
              detection: message.updates.detection,
              isLoading: false,
              error: null,
            },
          }));
          break;

        case "squadWatchUpdate":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              watch: message.snapshot,
              error: message.snapshot.status.error,
            },
          }));
          break;

        case "squadCharterSaved":
          setState((prev) => {
            const existingIndex = prev.squad.charters.findIndex((charter) => charter.agentId === message.charter.agentId);
            const charters =
              existingIndex >= 0
                ? prev.squad.charters.map((charter, index) => (index === existingIndex ? message.charter : charter))
                : [...prev.squad.charters, message.charter];
            return {
              ...prev,
              squad: {
                ...prev.squad,
                charters,
                error: null,
                isLoading: false,
              },
            };
          });
          break;

        case "squadDocSaved":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              decisions: message.doc.kind === "decisions" ? message.doc : prev.squad.decisions,
              routing: message.doc.kind === "routing" ? message.doc : prev.squad.routing,
              error: null,
              isLoading: false,
            },
          }));
          break;

        case "squadModelConfigUpdate":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              modelConfig: message.modelConfig,
            },
          }));
          break;

        case "squadModelConfigSaved":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              modelConfig: message.modelConfig,
              error: null,
              isLoading: false,
            },
          }));
          break;

        case "squadLoading":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              isLoading: message.isLoading,
            },
          }));
          break;

        case "squadError":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              error: message.error,
              isLoading: false,
            },
          }));
          break;

        case "squadPresetsDiscovered":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              presetPicker: {
                ...prev.squad.presetPicker,
                loading: false,
                loaded: true,
                presets: message.presets,
                rejected: message.rejected,
                unreachable: message.unreachable,
                error: null,
              },
            },
          }));
          break;

        case "squadPresetsLoading":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              presetPicker: {
                ...prev.squad.presetPicker,
                loading: message.isLoading,
              },
            },
          }));
          break;

        case "squadPresetsError":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              presetPicker: {
                ...prev.squad.presetPicker,
                loading: false,
                loaded: true,
                error: message.error,
              },
            },
          }));
          break;

        case "squadInitResult":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              presetPicker: {
                ...prev.squad.presetPicker,
                initResultPresetId: message.presetId,
                initError: message.error ?? null,
              },
            },
          }));
          break;

        case "squadUpstreamOperationStarted":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              upstreamOperation: {
                operation: message.operation,
                name: message.name,
                status: "running",
                error: null,
              },
            },
          }));
          break;

        case "squadUpstreamOperationResult":
          setState((prev) => ({
            ...prev,
            squad: {
              ...prev.squad,
              upstreams: message.upstreams,
              upstreamOperation: {
                operation: message.operation,
                name: message.name,
                status: message.ok ? "succeeded" : "failed",
                error: message.ok ? null : message.error ?? null,
              },
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
    const unsubscribeDevOpsConnections = messenger.onMessage("devOpsConnectionsUpdate", handleMessage);
    const unsubscribeDevOpsError = messenger.onMessage("devOpsConnectionError", handleMessage);
    const unsubscribeScanProgress = messenger.onMessage("metadataScanProgress", handleMessage);
    const unsubscribeScanComplete = messenger.onMessage("metadataScanComplete", handleMessage);
    const unsubscribeWorkflows = messenger.onMessage("workflowListUpdate", handleMessage);
    const unsubscribeUpdatesAvailable = messenger.onMessage("templateUpdatesAvailable", handleMessage);
    const unsubscribeSquadStatus = messenger.onMessage("squadStatusUpdate", handleMessage);
    const unsubscribeSquadPlugins = messenger.onMessage("squadPluginsUpdate", handleMessage);
    const unsubscribeSquadPluginAction = messenger.onMessage("squadPluginActionResult", handleMessage);
    const unsubscribeSquadRoster = messenger.onMessage("squadRosterUpdate", handleMessage);
    const unsubscribeSquadDocs = messenger.onMessage("squadDocsUpdate", handleMessage);
    const unsubscribeSquadLogs = messenger.onMessage("squadLogsUpdate", handleMessage);
    const unsubscribeSquadDoctor = messenger.onMessage("squadDoctorUpdate", handleMessage);
    const unsubscribeSquadUpdates = messenger.onMessage("squadUpdatesUpdate", handleMessage);
    const unsubscribeSquadWatch = messenger.onMessage("squadWatchUpdate", handleMessage);
    const unsubscribeSquadCharterSaved = messenger.onMessage("squadCharterSaved", handleMessage);
    const unsubscribeSquadDocSaved = messenger.onMessage("squadDocSaved", handleMessage);
    const unsubscribeSquadModelConfig = messenger.onMessage("squadModelConfigUpdate", handleMessage);
    const unsubscribeSquadModelConfigSaved = messenger.onMessage("squadModelConfigSaved", handleMessage);
    const unsubscribeSquadLoading = messenger.onMessage("squadLoading", handleMessage);
    const unsubscribeSquadError = messenger.onMessage("squadError", handleMessage);
    const unsubscribeSquadPresetsDiscovered = messenger.onMessage("squadPresetsDiscovered", handleMessage);
    const unsubscribeSquadPresetsLoading = messenger.onMessage("squadPresetsLoading", handleMessage);
    const unsubscribeSquadPresetsError = messenger.onMessage("squadPresetsError", handleMessage);
    const unsubscribeSquadInitResult = messenger.onMessage("squadInitResult", handleMessage);
    const unsubscribeSquadUpstreamStarted = messenger.onMessage("squadUpstreamOperationStarted", handleMessage);
    const unsubscribeSquadUpstreamResult = messenger.onMessage("squadUpstreamOperationResult", handleMessage);

    // Request initial state from extension
    messenger.sendMessage({ command: "webviewReady" });

    // Cleanup all subscriptions on unmount
    return () => {
      unsubscribeWorkspace();
      unsubscribeTemplateData();
      unsubscribeInstalled();
      unsubscribeProfiles();
      unsubscribeMetadata();
      unsubscribeDevOpsConnections();
      unsubscribeDevOpsError();
      unsubscribeScanProgress();
      unsubscribeScanComplete();
      unsubscribeWorkflows();
      unsubscribeUpdatesAvailable();
      unsubscribeSquadStatus();
      unsubscribeSquadPlugins();
      unsubscribeSquadPluginAction();
      unsubscribeSquadRoster();
      unsubscribeSquadDocs();
      unsubscribeSquadLogs();
      unsubscribeSquadDoctor();
      unsubscribeSquadUpdates();
      unsubscribeSquadWatch();
      unsubscribeSquadCharterSaved();
      unsubscribeSquadDocSaved();
      unsubscribeSquadModelConfig();
      unsubscribeSquadModelConfigSaved();
      unsubscribeSquadLoading();
      unsubscribeSquadError();
      unsubscribeSquadPresetsDiscovered();
      unsubscribeSquadPresetsLoading();
      unsubscribeSquadPresetsError();
      unsubscribeSquadInitResult();
      unsubscribeSquadUpstreamStarted();
      unsubscribeSquadUpstreamResult();
    };
  }, [messenger]);

  return <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>;
}
