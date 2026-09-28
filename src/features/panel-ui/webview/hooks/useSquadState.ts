/**
 * Custom hook for accessing Squad state and actions (SQD-007).
 *
 * Reads the Squad slice from the global {@link useAppState} and exposes
 * presentational-friendly selectors plus action functions that post messages
 * to the extension host (host routing is implemented in #223). Components stay
 * purely presentational; all side effects live here.
 */

import { useMemo } from "preact/hooks";
import { useAppState } from "./useAppState";
import { useVSCodeAPI } from "./useVSCodeAPI";
import type {
  SquadCharter,
  SquadDetectionResult,
  SquadDocKind,
  SquadDoctorReport,
  SquadError,
  SquadMarkdownDoc,
  SquadPluginRef,
  SquadPreset,
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

  /** Installed plugins. */
  plugins: SquadPluginRef[];

  /** Presets available from Nexus plugins. */
  presets: SquadPreset[];

  /** Currently selected preset id, or `null`. */
  selectedPresetId: string | null;

  /** The currently selected preset object, or `null`. */
  selectedPreset: SquadPreset | null;

  /** Latest Squad Doctor report, when produced. */
  doctor: SquadDoctorReport | null;

  /** Request the initial Squad state / refresh everything. */
  refresh: () => void;

  /** Re-run Squad detection (files + CLI). */
  refreshDetection: () => void;

  /** Persist an edited agent charter (host backs up before writing). */
  saveCharter: (agentId: string, content: string) => void;

  /** Persist an edited governance document (decisions/routing). */
  saveDoc: (kind: SquadDocKind, content: string) => void;

  /** Select a preset without applying it. */
  selectPreset: (presetId: string) => void;

  /** Apply/initialise a preset. */
  applyPreset: (presetId: string) => void;

  /** Run Squad Doctor diagnostics. */
  runDoctor: () => void;
}

/**
 * Hook to access Squad state and actions.
 */
export function useSquadState(): UseSquadStateResult {
  const { squad } = useAppState();
  const messenger = useVSCodeAPI();

  const selectedPreset = useMemo(
    () => squad.presets.find((preset) => preset.id === squad.selectedPresetId) ?? null,
    [squad.presets, squad.selectedPresetId]
  );

  const refresh = () => {
    messenger.sendMessage({ command: "getSquadState" });
  };

  const refreshDetection = () => {
    messenger.sendMessage({ command: "refreshSquadDetection" });
  };

  const saveCharter = (agentId: string, content: string) => {
    messenger.sendMessage({ command: "saveSquadCharter", agentId, content });
  };

  const saveDoc = (kind: SquadDocKind, content: string) => {
    messenger.sendMessage({ command: "saveSquadDoc", kind, content });
  };

  const selectPreset = (presetId: string) => {
    messenger.sendMessage({ command: "selectSquadPreset", presetId });
  };

  const applyPreset = (presetId: string) => {
    messenger.sendMessage({ command: "applySquadPreset", presetId });
  };

  const runDoctor = () => {
    messenger.sendMessage({ command: "runSquadDoctor" });
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
    plugins: squad.plugins,
    presets: squad.presets,
    selectedPresetId: squad.selectedPresetId,
    selectedPreset,
    doctor: squad.doctor,
    refresh,
    refreshDetection,
    saveCharter,
    saveDoc,
    selectPreset,
    applyPreset,
    runDoctor,
  };
}
