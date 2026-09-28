/**
 * Domain types describing Squad presets available from Nexus plugins.
 *
 * Covers PRD FR-010 (list presets available in Nexus plugins) and FR-011
 * (reserved `squad/` sub-folder within each team plugin). Also models the
 * source a preset originates from, since plugins may be local marketplace
 * entries or external private repos (FR-012).
 */

/** Where a Squad preset originates from (FR-012). */
export const SquadPresetSourceKind = {
  /** A plugin hosted in the Nexus plugin marketplace. */
  Marketplace: "marketplace",
  /** A plugin whose definition points to an external/private repository. */
  ExternalRepo: "external-repo",
  /** A local folder path. */
  Local: "local",
} as const;

export type SquadPresetSourceKind = (typeof SquadPresetSourceKind)[keyof typeof SquadPresetSourceKind];

/**
 * The origin of a Squad preset. Identifies the owning plugin and the
 * reserved `squad/` sub-folder (FR-011) the preset is fetched from.
 */
export interface SquadPresetSource {
  /** Kind of source (marketplace / external repo / local). */
  kind: SquadPresetSourceKind;

  /** Identifier of the owning plugin (e.g. "greffondors"). */
  pluginId: string;

  /**
   * Repository or marketplace reference (e.g.
   * "NexusInnovation/nexus-plugin-marketplace"), when applicable.
   */
  repository?: string;

  /**
   * Path to the reserved `squad/` sub-folder within the plugin the preset is
   * downloaded from recursively (FR-011/FR-013).
   */
  squadFolderPath: string;
}

/**
 * A selectable Squad preset surfaced in the panel (FR-010).
 * Descriptor only — fetching/initialisation is handled downstream (SQD-011+).
 */
export interface SquadPreset {
  /** Stable preset identifier, unique within its source. */
  id: string;

  /** Display name for the preset. */
  name: string;

  /** Short description of what the preset provides. */
  description?: string;

  /** Origin of the preset. */
  source: SquadPresetSource;

  /** Preset schema/content version, when advertised. */
  version?: string;
}
