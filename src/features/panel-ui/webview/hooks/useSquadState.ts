/**
 * Custom hook for accessing Squad state and actions (SQD-007).
 *
 * Reads the Squad slice from the global {@link useAppState} and exposes
 * presentational-friendly selectors plus action functions that post messages
 * to the extension host (host routing is implemented in #223). Components stay
 * purely presentational; all side effects live here.
 */

import { useAppState } from "./useAppState";
import { useVSCodeAPI } from "./useVSCodeAPI";
import type {
  SquadCharter,
  SquadCliSource,
  SquadDetectionResult,
  SquadDocKind,
  SquadDoctorReport,
  SquadError,
  SquadMarkdownDoc,
  SquadMarketplaceRef,
  SquadModelConfigDocument,
  SquadPluginAction,
  SquadPluginRef,
  SquadRosterMember,
  SquadUpstreamRecommendations,
  SquadUpdatesResult,
  SquadUpstreamSource,
} from "../../../squad/models";
import type {
  SquadBacklogState,
  SquadLogDocument,
  SquadPluginActionResultState,
  SquadUpstreamOperationState,
} from "../types/squadState";

/**
 * Hook result for Squad state and actions.
 */
export interface UseSquadStateResult {
  /** Whether the first Squad status snapshot has been received. */
  isReady: boolean;

  /** Whether a Squad detection/refresh/doctor run is currently in flight. */
  isLoading: boolean;

  /** Structured, actionable error, or `null` when healthy. */
  error: SquadError | null;

  /** Detection snapshot (install state, project/CLI versions). */
  detection: SquadDetectionResult | null;

  /** Team roster from `.squad/team.md`. */
  roster: SquadRosterMember[];

  /** Agent charters from `.squad/agents/<id>/charter.md`. */
  charters: SquadCharter[];

  /** Editable `.squad/decisions.md`, when present. */
  decisions: SquadMarkdownDoc | null;

  /** Editable `.squad/routing.md`, when present. */
  routing: SquadMarkdownDoc | null;

  /** Editable `.squad/model-config.json` document (FR-063), once read. */
  modelConfig: SquadModelConfigDocument | null;

  /** Read-only agent histories, logs and orchestration logs. */
  logs: SquadLogDocument[];

  /** Upstream inheritance sources. */
  upstreams: SquadUpstreamSource[];

  /** Org → team → project recommendations and upstream warnings, when evaluated. */
  upstreamRecommendations: SquadUpstreamRecommendations | null;

  /** Plugin marketplaces. */
  marketplaces: SquadMarketplaceRef[];

  /** Installed plugins. */
  plugins: SquadPluginRef[];

  /** Result of the most recent plugin action, or `null`. */
  lastPluginAction: SquadPluginActionResultState | null;

  /** GitHub Issues / Azure DevOps backlog status (FR-050/FR-051). */
  backlog: SquadBacklogState;

  /** Latest Squad Doctor report, when produced. */
  doctor: SquadDoctorReport | null;

  /** Latest Squad CLI/project update-check result, when requested. */
  updates: SquadUpdatesResult | null;

  /** Request the initial Squad state / refresh everything. */
  refresh: () => void;

  /** Re-run Squad detection (files + CLI). */
  refreshDetection: () => void;

  /** Persist an edited agent charter (host backs up before writing). */
  saveCharter: (agentId: string, content: string) => void;

  /**
   * Persist an edited governance document (decisions/routing). Pass the
   * `contentHash` of the doc the edit started from so the host can reject the
   * save with a `write-conflict` error if the file changed on disk meanwhile.
   */
  saveDoc: (kind: SquadDocKind, content: string, baseContentHash?: string | null) => void;

  /**
   * Persist edited `.squad/model-config.json` JSON (FR-063). The host validates
   * JSON/schema, backs up, then writes; invalid content surfaces a squadError.
   */
  saveModelConfig: (content: string) => void;

  /** Run Squad Doctor diagnostics. */
  runDoctor: () => void;

  /** Check for available Squad CLI/project updates without running upgrades. */
  checkUpdates: () => void;

  /** Re-read Squad plugin marketplaces and installed plugins. */
  refreshPlugins: () => void;

  /** Re-run backlog detection without refreshing the whole Squad panel. */
  refreshBacklog: () => void;

  /**
   * Run a plugin marketplace / lifecycle action (FR-040/FR-041/FR-044). The
   * host confirms and backs up before any write, and prompts for the operand
   * (marketplace source or plugin folder) when `target` is omitted.
   */
  runPluginAction: (action: SquadPluginAction, target?: string) => void;

  /**
   * Persist how the Squad CLI is invoked (FR-004): install globally via npm,
   * run on demand with npx, or use a custom executable path. The host writes
   * the choice through SettingsManager and re-runs detection.
   */
  setCliInvocation: (source: SquadCliSource, cliPath?: string) => void;

  /**
   * Install the Squad CLI globally via npm. The host asks for explicit
   * confirmation, then runs the install command in a VS Code terminal and
   * re-runs detection — it never installs silently.
   */
  installCli: () => void;

  /** Latest upstream operation (running / succeeded / failed), or `null`. */
  upstreamOperation: SquadUpstreamOperationState | null;

  /** Re-list upstreams through `squad upstream list` (FR-032). */
  listUpstreams: () => void;

  /** Add a free local / git / export upstream via `squad upstream add` (FR-031). */
  addUpstream: (source: string, name?: string, ref?: string) => void;

  /** Sync one upstream, or all when `name` is omitted (FR-032). */
  syncUpstream: (name?: string) => void;

  /** Remove an upstream; the host asks for confirmation first (FR-032). */
  removeUpstream: (name: string) => void;
}

/**
 * Hook to access Squad state and actions.
 */
export function useSquadState(): UseSquadStateResult {
  const { squad } = useAppState();
  const messenger = useVSCodeAPI();

  const refresh = () => {
    messenger.sendMessage({ command: "getSquadState" });
  };

  const refreshDetection = () => {
    messenger.sendMessage({ command: "refreshSquadDetection" });
  };

  const saveCharter = (agentId: string, content: string) => {
    messenger.sendMessage({ command: "saveSquadCharter", agentId, content });
  };

  const saveDoc = (kind: SquadDocKind, content: string, baseContentHash?: string | null) => {
    messenger.sendMessage(
      baseContentHash === undefined
        ? { command: "saveSquadDoc", kind, content }
        : { command: "saveSquadDoc", kind, content, baseContentHash }
    );
  };

  const saveModelConfig = (content: string) => {
    messenger.sendMessage({ command: "saveSquadModelConfig", content });
  };

  const runDoctor = () => {
    messenger.sendMessage({ command: "runSquadDoctor" });
  };

  const checkUpdates = () => {
    messenger.sendMessage({ command: "checkSquadUpdates" });
  };

  const refreshPlugins = () => {
    messenger.sendMessage({ command: "refreshSquadPlugins" });
  };

  const refreshBacklog = () => {
    messenger.sendMessage({ command: "refreshSquadBacklog" });
  };

  const runPluginAction = (action: SquadPluginAction, target?: string) => {
    messenger.sendMessage({ command: "runSquadPluginAction", action, target });
  };

  const setCliInvocation = (source: SquadCliSource, cliPath?: string) => {
    messenger.sendMessage({ command: "setSquadCliInvocation", source, cliPath });
  };

  const installCli = () => {
    messenger.sendMessage({ command: "installSquadCli" });
  };

  const listUpstreams = () => {
    messenger.sendMessage({ command: "listSquadUpstreams" });
  };

  const addUpstream = (source: string, name?: string, ref?: string) => {
    messenger.sendMessage({ command: "addSquadUpstream", source, name, ref });
  };

  const syncUpstream = (name?: string) => {
    messenger.sendMessage({ command: "syncSquadUpstream", name });
  };

  const removeUpstream = (name: string) => {
    messenger.sendMessage({ command: "removeSquadUpstream", name });
  };

  return {
    isReady: squad.isReady,
    isLoading: squad.isLoading,
    error: squad.error,
    detection: squad.detection,
    roster: squad.roster,
    charters: squad.charters,
    decisions: squad.decisions,
    routing: squad.routing,
    modelConfig: squad.modelConfig,
    logs: squad.logs,
    upstreams: squad.upstreams,
    upstreamRecommendations: squad.upstreamRecommendations,
    marketplaces: squad.marketplaces,
    plugins: squad.plugins,
    lastPluginAction: squad.lastPluginAction,
    backlog: squad.backlog,
    doctor: squad.doctor,
    updates: squad.updates,
    refresh,
    refreshDetection,
    saveCharter,
    saveDoc,
    saveModelConfig,
    runDoctor,
    checkUpdates,
    refreshPlugins,
    refreshBacklog,
    runPluginAction,
    setCliInvocation,
    installCli,
    upstreamOperation: squad.upstreamOperation,
    listUpstreams,
    addUpstream,
    syncUpstream,
    removeUpstream,
  };
}
