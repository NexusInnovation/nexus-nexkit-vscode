/**
 * Pure helpers for the Squad marketplace & plugin UI (SQD-040, FR-042/043/044).
 *
 * Free of Preact and `vscode` imports so they stay trivially unit-testable.
 */

import { NEXUS_SQUAD_MARKETPLACE_REPO, SQUAD_PLUGIN_ACTIONS, SquadPluginStatus } from "../../../squad/models";
import type { SquadError, SquadMarketplaceRef, SquadPluginRef } from "../../../squad/models";
import type { SquadPluginActionResultState } from "../types/squadState";
import { isCancelledError, type SquadOperationFeedback } from "./squadUpstreamFormat";

/** Whether two structured errors describe the same failure (host messages are re-serialised). */
export function isSameSquadError(a: SquadError | null | undefined, b: SquadError | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return a.code === b.code && a.message === b.message;
}

/**
 * Whether a shared Squad error belongs to the plugin area (inventory read or
 * plugin action), so it is rendered once, in the Plugins section, instead of
 * being duplicated in unrelated sections.
 */
export function isSquadPluginError(
  error: SquadError | null | undefined,
  lastAction: SquadPluginActionResultState | null = null
): boolean {
  if (!error) {
    return false;
  }
  if (isSameSquadError(error, lastAction?.error)) {
    return true;
  }
  return error.code.startsWith("plugin-") || /\bplugins?\b/i.test(error.message);
}

/** Whether the Nexus marketplace (FR-040) is already registered. */
export function hasNexusMarketplace(marketplaces: SquadMarketplaceRef[]): boolean {
  const repo = NEXUS_SQUAD_MARKETPLACE_REPO.toLowerCase();
  return marketplaces.some((marketplace) => marketplace.source.toLowerCase().includes(repo));
}

/** Normalised lifecycle status of an installed plugin. */
export function pluginStatus(plugin: SquadPluginRef): SquadPluginStatus {
  return plugin.status ?? (plugin.enabled ? SquadPluginStatus.Enabled : SquadPluginStatus.Disabled);
}

/** Human-readable label for a plugin status. */
export const PLUGIN_STATUS_LABEL: Record<SquadPluginStatus, string> = {
  [SquadPluginStatus.Enabled]: "Enabled",
  [SquadPluginStatus.Disabled]: "Disabled",
  [SquadPluginStatus.Unknown]: "Unknown",
};

/**
 * Describe the most recent plugin action outcome. A failure never maps to a
 * success tone; a declined confirmation or dismissed prompt maps to `cancelled`.
 */
export function describePluginActionResult(result: SquadPluginActionResultState | null): SquadOperationFeedback | null {
  if (!result) {
    return null;
  }

  const label = SQUAD_PLUGIN_ACTIONS[result.action]?.label ?? result.action;
  const target = result.target ? ` (${result.target})` : "";

  if (!result.ok) {
    const error: SquadError = result.error ?? {
      code: "plugin-action-failed",
      message: "The Squad plugin action failed.",
      remediation: "Check the Nexkit output channel for details and try again.",
    };
    if (isCancelledError(error)) {
      return { tone: "cancelled", message: error.message, error };
    }
    return { tone: "error", message: `${label}${target} failed.`, error };
  }

  const unchanged = result.changed === false ? " No changes were made." : "";
  return { tone: "success", message: `${label}${target} completed.${unchanged}`, error: null };
}
