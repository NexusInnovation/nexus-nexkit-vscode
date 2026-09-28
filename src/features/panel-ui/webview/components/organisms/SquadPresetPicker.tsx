import { useEffect } from "preact/hooks";
import { useSquadPresets } from "../../hooks/useSquadPresets";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { summarizeSquadPreset, describeSquadPresetSource } from "../../utils/squadPresetGrouping";
import type { SquadPresetGroup, DisplayRejectedPreset } from "../../utils/squadPresetGrouping";
import type { SquadError, SquadPreset, UnreachableSquadSource } from "../../../../squad/models";

/**
 * SquadPresetPicker Component (SQD-019, FR-010/FR-014/FR-015)
 *
 * The preset selection screen shown in the "Squad not detected" slot of the
 * Squad tab. On first mount it discovers presets from every source (Nexus
 * marketplace + external repositories) through the {@link useSquadPresets}
 * hook, then renders them grouped by source with a name/description/source
 * summary. Presets that fail the SQD-015 contract are shown disabled with their
 * blocking diagnostics; sources that could not be reached surface their own
 * actionable error; and loading / empty / hard-error states are all explicit so
 * a failure never looks like an empty success.
 *
 * Selecting a preset opens a confirmation panel whose "Initialize" action sends
 * an init request to the host (the actual initialisation ships in #235; until
 * then the host replies with a clear "not available yet" error shown inline).
 *
 * Purely presentational: all side effects and message plumbing live in the hook.
 */
export function SquadPresetPicker() {
  const {
    loading,
    loaded,
    error,
    groups,
    unreachable,
    isEmpty,
    selectedPresetId,
    selectedPreset,
    initError,
    refresh,
    select,
    initFromPreset,
  } = useSquadPresets();

  // Discover presets the first time the picker is shown.
  useEffect(() => {
    if (!loaded && !loading) {
      refresh();
    }
  }, []);

  return (
    <div class="squad-preset-picker">
      <div class="squad-preset-picker-header">
        <div>
          <p class="squad-preset-picker-title">
            <i class="codicon codicon-rocket" aria-hidden="true"></i> Initialise Squad from a preset
          </p>
          <p class="squad-preset-picker-subtitle">
            Squad is not initialised in this workspace. Pick a team preset below to get started, or run a standard{" "}
            <code>squad init</code> from the terminal.
          </p>
        </div>
        <button class="squad-refresh-button" onClick={refresh} disabled={loading} title="Refresh preset list">
          <i class="codicon codicon-refresh" aria-hidden="true"></i> Refresh
        </button>
      </div>

      {loading && !loaded ? <p class="loading">Discovering Squad presets…</p> : null}

      {error ? (
        <>
          <SquadErrorNotice error={error} />
          <button class="squad-retry-button" onClick={refresh}>
            <i class="codicon codicon-refresh" aria-hidden="true"></i> Retry
          </button>
        </>
      ) : null}

      {unreachable.length > 0 ? <UnreachableSources sources={unreachable} /> : null}

      {loaded && !error ? (
        <>
          {groups.map((group) => (
            <PresetGroup
              key={group.key}
              group={group}
              selectedPresetId={selectedPresetId}
              onSelect={select}
            />
          ))}

          {isEmpty ? <EmptyPresets /> : null}
        </>
      ) : null}

      {selectedPreset ? (
        <ConfirmationPanel
          preset={selectedPreset}
          initError={initError}
          onInitialize={() => initFromPreset(selectedPreset.id)}
          onCancel={() => select(null)}
        />
      ) : null}
    </div>
  );
}

/** A source that could not be reached, rendered with its actionable error. */
function UnreachableSources({ sources }: { sources: UnreachableSquadSource[] }) {
  return (
    <div class="squad-preset-unreachable">
      <p class="squad-preset-unreachable-title">
        <i class="codicon codicon-warning" aria-hidden="true"></i> Some preset sources could not be reached
      </p>
      {sources.map((source) => (
        <div class="squad-preset-unreachable-item" key={source.sourceId}>
          <span class="squad-preset-unreachable-label">{source.label}</span>
          <SquadErrorNotice error={source.error} />
        </div>
      ))}
    </div>
  );
}

/** One source group: its valid presets plus any rejected candidates. */
function PresetGroup({
  group,
  selectedPresetId,
  onSelect,
}: {
  group: SquadPresetGroup;
  selectedPresetId: string | null;
  onSelect: (presetId: string) => void;
}) {
  return (
    <div class="squad-preset-group">
      <h4 class="squad-preset-group-title">{group.label}</h4>

      {group.presets.map((preset) => (
        <PresetCard
          key={preset.id}
          preset={preset}
          selected={preset.id === selectedPresetId}
          onSelect={() => onSelect(preset.id)}
        />
      ))}

      {group.rejected.map((entry, index) => (
        <RejectedCard key={`${entry.name}-${index}`} entry={entry} />
      ))}
    </div>
  );
}

/** A selectable, valid preset. */
function PresetCard({
  preset,
  selected,
  onSelect,
}: {
  preset: SquadPreset;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      class={`squad-preset-card${selected ? " selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div class="squad-preset-card-head">
        <span class="squad-preset-card-name">{preset.name}</span>
        {selected ? <i class="codicon codicon-check" aria-hidden="true"></i> : null}
      </div>
      {preset.description ? <p class="squad-preset-card-desc">{preset.description}</p> : null}
      <p class="squad-preset-card-meta">{summarizeSquadPreset(preset)}</p>
    </button>
  );
}

/** A discovered-but-invalid preset, shown disabled with its blocking diagnostics. */
function RejectedCard({ entry }: { entry: DisplayRejectedPreset }) {
  return (
    <div class="squad-preset-card rejected" aria-disabled="true">
      <div class="squad-preset-card-head">
        <span class="squad-preset-card-name">{entry.name}</span>
        <span class="squad-preset-card-badge">
          <i class="codicon codicon-error" aria-hidden="true"></i> Invalid
        </span>
      </div>
      <p class="squad-preset-card-meta">{describeSquadPresetSource(entry.rejection.source)}</p>
      <ul class="squad-preset-diagnostics">
        {entry.rejection.diagnostics.map((diagnostic, index) => (
          <li key={index} class="squad-preset-diagnostic">
            <span class="squad-preset-diagnostic-message">
              {diagnostic.path ? <code>{diagnostic.path}</code> : null} {diagnostic.message}
            </span>
            {diagnostic.remediation ? (
              <span class="squad-preset-diagnostic-remediation">{diagnostic.remediation}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shown when a discovery succeeded but offered no valid presets (FR-015). */
function EmptyPresets() {
  return (
    <div class="squad-preset-empty info-message">
      <p>
        <i class="codicon codicon-info" aria-hidden="true"></i> No Squad presets are available.
      </p>
      <p>
        You can still initialise Squad with the standard CLI flow — run <code>squad init</code> in a terminal at the
        workspace root, then refresh this panel.
      </p>
    </div>
  );
}

/** Confirmation panel for the selected preset with the Initialize action. */
function ConfirmationPanel({
  preset,
  initError,
  onInitialize,
  onCancel,
}: {
  preset: SquadPreset;
  initError: SquadError | null;
  onInitialize: () => void;
  onCancel: () => void;
}) {
  return (
    <div class="squad-preset-confirm">
      <h4 class="squad-preset-confirm-title">
        <i class="codicon codicon-verified" aria-hidden="true"></i> Initialise from “{preset.name}”
      </h4>
      {preset.description ? <p class="squad-preset-confirm-desc">{preset.description}</p> : null}
      <p class="squad-preset-confirm-meta">{summarizeSquadPreset(preset)}</p>

      {initError ? <SquadErrorNotice error={initError} /> : null}

      <div class="squad-preset-confirm-actions">
        <button class="squad-preset-init-button" onClick={onInitialize}>
          <i class="codicon codicon-rocket" aria-hidden="true"></i> Initialize
        </button>
        <button class="squad-preset-cancel-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
