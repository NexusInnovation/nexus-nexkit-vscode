/**
 * Pure, Preact-free helpers for the Squad preset selection screen (SQD-019 /
 * #234, PRD FR-010/FR-014/FR-015).
 *
 * Groups the discovered presets and their per-preset validation rejections by
 * originating source so the picker can render one section per source, and
 * builds user-facing labels/summaries. Kept dependency-free (types imported
 * type-only) so it is unit-testable in the extension-host Mocha runner without
 * a webview harness.
 */

import type {
  RejectedSquadPreset,
  SquadPreset,
  SquadPresetSource,
} from "../../../squad/models";
import { SquadPresetSourceKind } from "../../../squad/models";

/**
 * A rejected preset paired with a display name for the picker. Rejected
 * presets are not full {@link SquadPreset}s (they failed validation), so a
 * best-effort name is derived from the owning plugin.
 */
export interface DisplayRejectedPreset {
  /** The original rejection, with its blocking diagnostics. */
  rejection: RejectedSquadPreset;

  /** Best-effort display name (the owning plugin id). */
  name: string;
}

/**
 * A group of presets that share the same originating source, ready to render
 * as one section in the picker.
 */
export interface SquadPresetGroup {
  /** Stable key for the group (source kind). */
  key: string;

  /** Human-readable source label (e.g. "Nexus plugin marketplace"). */
  label: string;

  /** Valid, selectable presets from this source. */
  presets: SquadPreset[];

  /** Presets from this source that failed validation (shown disabled). */
  rejected: DisplayRejectedPreset[];
}

const SOURCE_KIND_LABELS: Record<string, string> = {
  [SquadPresetSourceKind.Marketplace]: "Nexus plugin marketplace",
  [SquadPresetSourceKind.ExternalRepo]: "External plugin repositories",
  [SquadPresetSourceKind.Local]: "Local folders",
};

const SOURCE_KIND_ORDER: string[] = [
  SquadPresetSourceKind.Marketplace,
  SquadPresetSourceKind.ExternalRepo,
  SquadPresetSourceKind.Local,
];

/** Human-readable label for a preset source kind. */
export function describeSquadPresetSourceKind(kind: string): string {
  return SOURCE_KIND_LABELS[kind] ?? "Other sources";
}

/**
 * A one-line, human-readable description of where a preset comes from, e.g.
 * "greffondors · NexusInnovation/nexus-nexkit-templates-cnq".
 */
export function describeSquadPresetSource(source: SquadPresetSource): string {
  const parts: string[] = [];
  if (source.pluginId) {
    parts.push(source.pluginId);
  }
  if (source.repository) {
    parts.push(source.repository);
  }
  return parts.join(" · ") || describeSquadPresetSourceKind(source.kind);
}

/**
 * A short summary line for a preset card. The listing descriptor does not carry
 * the preset's agent roster (that lives in the not-yet-downloaded `team.md`), so
 * the summary is built from the version and source rather than fabricating an
 * agent count.
 */
export function summarizeSquadPreset(preset: SquadPreset): string {
  const parts: string[] = [];
  if (preset.version) {
    parts.push(`v${preset.version}`);
  }
  parts.push(describeSquadPresetSource(preset.source));
  return parts.join(" · ");
}

/**
 * Group valid presets and rejected candidates by their source kind, ordered
 * marketplace → external → local → other. Groups with neither presets nor
 * rejections are omitted.
 */
export function groupSquadPresets(
  presets: readonly SquadPreset[],
  rejected: readonly RejectedSquadPreset[]
): SquadPresetGroup[] {
  const groups = new Map<string, SquadPresetGroup>();

  const ensure = (kind: string): SquadPresetGroup => {
    let group = groups.get(kind);
    if (!group) {
      group = {
        key: kind,
        label: describeSquadPresetSourceKind(kind),
        presets: [],
        rejected: [],
      };
      groups.set(kind, group);
    }
    return group;
  };

  for (const preset of presets) {
    ensure(preset.source.kind).presets.push(preset);
  }

  for (const rejection of rejected) {
    ensure(rejection.source.kind).rejected.push({
      rejection,
      name: rejection.pluginId || "Unknown preset",
    });
  }

  const orderIndex = (kind: string): number => {
    const index = SOURCE_KIND_ORDER.indexOf(kind);
    return index === -1 ? SOURCE_KIND_ORDER.length : index;
  };

  return [...groups.values()].sort((a, b) => {
    const delta = orderIndex(a.key) - orderIndex(b.key);
    return delta !== 0 ? delta : a.label.localeCompare(b.label);
  });
}

/** Total count of selectable (valid) presets across the groups. */
export function countSelectablePresets(groups: readonly SquadPresetGroup[]): number {
  return groups.reduce((total, group) => total + group.presets.length, 0);
}
