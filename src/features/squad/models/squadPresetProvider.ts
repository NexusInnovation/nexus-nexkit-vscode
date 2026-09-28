/**
 * Common, pluggable Squad preset *source* contract (SQD-017).
 *
 * A {@link SquadPresetProvider} discovers Squad presets from one origin and
 * returns SQD-001 {@link SquadPreset} descriptors validated against the SQD-015
 * contract. Keeping this interface source-agnostic lets the Nexus marketplace
 * provider (SQD-017, local marketplace plugins) and the external `greffondors`
 * repository provider (SQD-018 / #233) plug in interchangeably behind the same
 * discovery API — the panel and init flows depend only on this contract.
 *
 * Covers PRD FR-010 (surface available presets) and FR-012 (local marketplace
 * plugins vs. external plugin repositories as distinct sources).
 *
 * These types are `vscode`-free so they can be shared by the extension host and
 * the Preact webview.
 */

import { SquadPreset, SquadPresetSource } from "./squadPreset";
import { SquadPresetDiagnostic } from "./squadPresetValidation";
import { SquadError, SquadResult } from "./squadResult";

/**
 * A preset that was found in a source but rejected by the SQD-015 contract.
 *
 * Surfaced (never silently dropped) so the UI can explain, per plugin, *why* a
 * candidate preset is not offered — the diagnostics carry actionable
 * remediation text.
 */
export interface RejectedSquadPreset {
  /** Identifier of the owning plugin the rejected preset came from. */
  pluginId: string;

  /** Origin descriptor of the rejected preset. */
  source: SquadPresetSource;

  /** The blocking (error-severity) diagnostics that caused the rejection. */
  diagnostics: SquadPresetDiagnostic[];
}

/**
 * A source that was known but could not be reached or read.
 *
 * Distinct from {@link RejectedSquadPreset}: a rejected preset *was* fetched but
 * failed the SQD-015 contract (so it carries diagnostics), whereas an
 * unreachable source could not be fetched or resolved at all (so it carries the
 * structured {@link SquadError} directly). Surfacing these per-source lets an
 * aggregating provider report *why* one origin failed without hiding the
 * presets that other origins returned — a single failing external repository or
 * child provider must never collapse the whole discovery into a failure.
 */
export interface UnreachableSquadSource {
  /**
   * Identifier of the failing origin — a plugin id for a per-repo failure or a
   * child provider id for a whole-provider failure.
   */
  sourceId: string;

  /** Human-readable label of the failing origin, for logs and UI. */
  label: string;

  /**
   * Preset source descriptor, when the failure is scoped to a specific plugin
   * repository. Omitted for a whole-provider failure.
   */
  source?: SquadPresetSource;

  /** The actionable, structured error explaining why the source is unreachable. */
  error: SquadError;
}

/**
 * Outcome of discovering presets from a single source.
 *
 * A reachable-but-empty source is a success carrying empty arrays; only a
 * failure to *reach or read* the source as a whole is a {@link SquadResult}
 * failure. Individual sub-sources that fail (e.g. one external repository among
 * several) are reported via {@link unreachable} so they never hide the healthy
 * results.
 */
export interface SquadPresetDiscovery {
  /** Valid, contract-passing preset descriptors ready to surface (FR-010). */
  presets: SquadPreset[];

  /**
   * Presets that were discovered but failed validation, with actionable
   * diagnostics. Kept separate from {@link presets} so failures are visible
   * without blocking the healthy presets from the same source.
   */
  rejected: RejectedSquadPreset[];

  /**
   * Sub-sources that could not be reached or read (e.g. a private external
   * repository the user cannot access, or a child provider that failed).
   * Optional so single-origin providers may omit it; present and populated by
   * multi-origin providers (SQD-018 external repos, the composite provider) so
   * one failing origin never hides the others.
   */
  unreachable?: UnreachableSquadSource[];
}

/**
 * A pluggable Squad preset source.
 *
 * Implementations: {@link NexusMarketplacePresetProvider} (SQD-017, local
 * marketplace plugins), {@link ExternalRepoPresetProvider} (SQD-018 / #233,
 * external repositories such as `greffondors`) and
 * {@link CompositeSquadPresetProvider} which aggregates several sources behind
 * this same contract.
 */
export interface SquadPresetProvider {
  /** Stable, machine-readable identifier of this source (e.g. `nexus-marketplace`). */
  readonly id: string;

  /** Human-readable label for logs and UI. */
  readonly label: string;

  /**
   * Discover the presets this source offers.
   *
   * @returns `squadOk` with the discovered presets (possibly empty) and any
   * rejected candidates; `squadErr` only when the source itself cannot be
   * reached or read (never a silent empty success on failure).
   */
  discoverPresets(): Promise<SquadResult<SquadPresetDiscovery>>;
}
