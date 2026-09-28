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
import { SquadResult } from "./squadResult";

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
 * Outcome of discovering presets from a single source.
 *
 * A reachable-but-empty source is a success carrying empty arrays; only a
 * failure to *reach or read* the source is a {@link SquadResult} failure.
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
}

/**
 * A pluggable Squad preset source.
 *
 * Implementations: {@link NexusMarketplacePresetProvider} (SQD-017, local
 * marketplace plugins) and, later, an external-repository provider for
 * `greffondors` (SQD-018 / #233).
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
