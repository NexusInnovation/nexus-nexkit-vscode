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
  SquadPluginRef,
  SquadRosterMember,
  SquadUpstreamSource,
} from "../../../squad/models";
import type { SquadLogDocument } from "../types/squadState";

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

  /** Read-only agent histories, logs and orchestration logs. */
  logs: SquadLogDocument[];

  /** Upstream inheritance sources. */
  upstreams: SquadUpstreamSource[];

  /** Plugin marketplaces. */
  marketplaces: SquadMarketplaceRef[];

  /** Installed plugins. */
  plugins: SquadPluginRef[];

  /** Latest Squad Doctor report, when produced. */
  doctor: SquadDoctorReport | null;

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

  /** Run Squad Doctor diagnostics. */
  runDoctor: () => void;

  /** Re-read Squad plugin marketplaces and installed plugins. */
  refreshPlugins: () => void;

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

  const runDoctor = () => {
    messenger.sendMessage({ command: "runSquadDoctor" });
  };

  const refreshPlugins = () => {
    messenger.sendMessage({ command: "refreshSquadPlugins" });
  };

  const setCliInvocation = (source: SquadCliSource, cliPath?: string) => {
    messenger.sendMessage({ command: "setSquadCliInvocation", source, cliPath });
  };

  const installCli = () => {
    messenger.sendMessage({ command: "installSquadCli" });
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
    logs: squad.logs,
    upstreams: squad.upstreams,
    marketplaces: squad.marketplaces,
    plugins: squad.plugins,
    doctor: squad.doctor,
    refresh,
    refreshDetection,
    saveCharter,
    saveDoc,
    runDoctor,
    refreshPlugins,
    setCliInvocation,
    installCli,
  };
}
