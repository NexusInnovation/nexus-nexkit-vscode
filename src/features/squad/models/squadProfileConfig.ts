/**
 * Squad configuration embedded in a NexKit profile.
 *
 * Covers PRD FR-065: a NexKit profile may include a Squad configuration —
 * the chosen preset, upstream sources, Squad plugins, per-agent model
 * settings, and Ralph preferences. This is the serialisable slice persisted
 * alongside a profile; all fields are optional so existing profiles without
 * Squad data remain valid.
 */

import { SquadAgentModelConfig, SquadPluginRef, SquadRalphPreferences, SquadUpstreamSource } from "./squadConfig";

/**
 * Optional Squad section of a NexKit {@link Profile} (FR-065).
 * Absence of this object means the profile carries no Squad configuration.
 */
export interface SquadProfileConfig {
  /** Identifier of the preset selected when Squad was initialised. */
  presetId?: string;

  /** Upstream inheritance sources captured in the profile. */
  upstreams?: SquadUpstreamSource[];

  /** Squad plugins captured in the profile. */
  plugins?: SquadPluginRef[];

  /** Per-agent model assignments captured in the profile. */
  modelConfig?: SquadAgentModelConfig[];

  /** Ralph / backlog automation preferences captured in the profile. */
  ralph?: SquadRalphPreferences;
}
