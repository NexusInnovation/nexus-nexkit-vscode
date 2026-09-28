/**
 * Selector + action hook for the Squad preset selection screen (SQD-019 /
 * #234, PRD FR-010/FR-014/FR-015).
 *
 * Reads the preset-picker slice from the global {@link useAppState} and exposes
 * grouped, presentational-friendly data plus the actions that post messages to
 * the extension host. Components stay purely presentational; all side effects
 * and the transient "selected preset" highlight live here.
 */

import { useMemo, useState } from "preact/hooks";
import { useAppState } from "./useAppState";
import { useVSCodeAPI } from "./useVSCodeAPI";
import type { SquadError, SquadPreset } from "../../../squad/models";
import type { SquadPresetGroup } from "../utils/squadPresetGrouping";
import { countSelectablePresets, groupSquadPresets } from "../utils/squadPresetGrouping";
import type { UnreachableSquadSource } from "../../../squad/models";

/** Hook result for the Squad preset selection screen. */
export interface UseSquadPresetsResult {
  /** True while a preset discovery is in flight. */
  loading: boolean;

  /** True once a discovery response (success or failure) has been received. */
  loaded: boolean;

  /** Source-level hard failure or init request error, or `null` when healthy. */
  error: SquadError | null;

  /** Valid presets and their rejected siblings, grouped by source. */
  groups: SquadPresetGroup[];

  /** Sources that could not be reached or read (shown per-source). */
  unreachable: UnreachableSquadSource[];

  /** Total number of selectable (valid) presets. */
  selectableCount: number;

  /** True when a load completed with zero selectable presets (FR-015). */
  isEmpty: boolean;

  /** Currently selected preset id (webview-local highlight), or `null`. */
  selectedPresetId: string | null;

  /** The currently selected preset object, or `null`. */
  selectedPreset: SquadPreset | null;

  /**
   * The most recent init failure, when it applies to the currently selected
   * preset (FR-014). Surfaced in the confirmation panel, never as success.
   */
  initError: SquadError | null;

  /** Discover presets from every source (or refresh the list). */
  refresh: () => void;

  /** Select a preset for the confirmation panel (webview-local). */
  select: (presetId: string | null) => void;

  /** Request Squad initialisation from the selected preset (FR-014; init in #235). */
  initFromPreset: (presetId: string) => void;
}

/**
 * Hook to access the Squad preset selection screen state and actions.
 */
export function useSquadPresets(): UseSquadPresetsResult {
  const { squad } = useAppState();
  const messenger = useVSCodeAPI();
  const picker = squad.presetPicker;

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  const groups = useMemo(
    () => groupSquadPresets(picker.presets, picker.rejected),
    [picker.presets, picker.rejected]
  );

  const selectableCount = useMemo(() => countSelectablePresets(groups), [groups]);

  const selectedPreset = useMemo(
    () => picker.presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [picker.presets, selectedPresetId]
  );

  const refresh = () => {
    messenger.sendMessage({ command: "listSquadPresets" });
  };

  const select = (presetId: string | null) => {
    setSelectedPresetId(presetId);
  };

  const initFromPreset = (presetId: string) => {
    messenger.sendMessage({ command: "initSquadFromPreset", presetId });
  };

  return {
    loading: picker.loading,
    loaded: picker.loaded,
    error: picker.error,
    groups,
    unreachable: picker.unreachable,
    selectableCount,
    isEmpty: picker.loaded && !picker.loading && !picker.error && selectableCount === 0,
    selectedPresetId,
    selectedPreset,
    initError:
      picker.initResultPresetId !== null && picker.initResultPresetId === selectedPresetId
        ? picker.initError
        : null,
    refresh,
    select,
    initFromPreset,
  };
}
