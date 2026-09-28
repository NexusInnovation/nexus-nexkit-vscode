/**
 * Aggregates several {@link SquadPresetProvider}s into one, so callers see the
 * presets from *every* configured origin behind a single discovery call
 * (SQD-018 / #233, PRD FR-010/FR-012).
 *
 * MVP wires two origins: {@link NexusMarketplacePresetProvider} (local
 * marketplace plugins, SQD-017) and {@link ExternalRepoPresetProvider}
 * (external repositories such as `greffondors`, SQD-018). The picker (SQD-019)
 * and init flow (SQD-020) depend only on the {@link SquadPresetProvider}
 * contract, so they consume this composite exactly like a single source.
 *
 * Failure isolation (PRD: errors must be visible, never a silent success): a
 * child provider that fails — or throws — never hides the presets the other
 * providers returned. Each child failure is folded into
 * {@link SquadPresetDiscovery.unreachable} with its actionable
 * {@link SquadError}, and the composite still returns `squadOk` carrying every
 * healthy preset. Callers inspect `unreachable` to surface the per-source
 * problems alongside the presets that resolved.
 *
 * `vscode`-free (no `vscode`, `fs` or `path` imports) so it and its unit tests
 * run under plain mocha.
 */

import {
  RejectedSquadPreset,
  SquadPreset,
  SquadPresetDiscovery,
  SquadPresetProvider,
  UnreachableSquadSource,
} from "../models";
import { SquadResult } from "../models/squadResult";

/**
 * A {@link SquadPresetProvider} that fans out to a set of child providers and
 * merges their discoveries, isolating per-provider failures.
 */
export class CompositeSquadPresetProvider implements SquadPresetProvider {
  public readonly id = "composite";
  public readonly label = "All Squad preset sources";

  private readonly _providers: readonly SquadPresetProvider[];

  constructor(providers: readonly SquadPresetProvider[]) {
    this._providers = providers;
  }

  /**
   * Discover presets from every child provider and merge the results.
   *
   * Always resolves to `squadOk`: a child provider that returns a failure or
   * throws is recorded in {@link SquadPresetDiscovery.unreachable} rather than
   * failing the whole aggregation, so one broken source never hides the others.
   */
  public async discoverPresets(): Promise<SquadResult<SquadPresetDiscovery>> {
    const presets: SquadPreset[] = [];
    const rejected: RejectedSquadPreset[] = [];
    const unreachable: UnreachableSquadSource[] = [];

    const settled = await Promise.all(
      this._providers.map(async (provider) => ({
        provider,
        outcome: await this.runProvider(provider),
      })),
    );

    for (const { provider, outcome } of settled) {
      if (!outcome.ok) {
        unreachable.push({
          sourceId: provider.id,
          label: provider.label,
          error: outcome.error,
        });
        continue;
      }

      presets.push(...outcome.value.presets);
      rejected.push(...outcome.value.rejected);
      if (outcome.value.unreachable) {
        unreachable.push(...outcome.value.unreachable);
      }
    }

    return {
      ok: true,
      value: { presets, rejected, ...(unreachable.length > 0 ? { unreachable } : {}) },
    };
  }

  /** Run one child provider, converting a thrown error into a `squadErr`. */
  private async runProvider(
    provider: SquadPresetProvider,
  ): Promise<SquadResult<SquadPresetDiscovery>> {
    try {
      return await provider.discoverPresets();
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "unknown",
          message: `The '${provider.label}' preset source failed unexpectedly.`,
          remediation: "Check the extension logs (Nexkit output channel) for details, then retry.",
          detail: error instanceof Error ? error.message : String(error),
          cause: error,
        },
      };
    }
  }
}
