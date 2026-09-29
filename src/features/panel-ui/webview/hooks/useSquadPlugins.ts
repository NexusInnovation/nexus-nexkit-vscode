/**
 * Selector hook for the Squad marketplace & plugin UI (SQD-040, FR-042/043/044).
 *
 * Derives the plugin view model from the centralized Squad slice and exposes
 * the plugin inventory / lifecycle actions from {@link useSquadState}. Write
 * actions are confirmed (and backed up) by the host before anything changes.
 */

import { useSquadState } from "./useSquadState";
import type { SquadError, SquadMarketplaceRef, SquadPluginAction, SquadPluginRef } from "../../../squad/models";
import type { SquadPluginActionResultState } from "../types/squadState";
import type { SquadOperationFeedback } from "../utils/squadUpstreamFormat";
import {
  describePluginActionResult,
  hasNexusMarketplace,
  isSameSquadError,
  isSquadPluginError,
} from "../utils/squadPluginFormat";

/** Hook result for the plugin management UI. */
export interface UseSquadPluginsResult {
  /** Whether the first Squad snapshot has been received. */
  isReady: boolean;

  /** True while a plugin action or refresh is in flight (actions are disabled). */
  isBusy: boolean;

  /** Marketplaces read from `.squad/plugins/marketplaces.json`. */
  marketplaces: SquadMarketplaceRef[];

  /** Installed plugins from `squad plugin list --json`. */
  plugins: SquadPluginRef[];

  /** Whether the Nexus marketplace is already registered. */
  nexusMarketplaceRegistered: boolean;

  /** Latest plugin action outcome, or `null`. */
  lastAction: SquadPluginActionResultState | null;

  /** Feedback for the latest plugin action (success / cancelled / error). */
  feedback: SquadOperationFeedback | null;

  /** Inventory-level error (marketplaces or plugin list could not be read). */
  inventoryError: SquadError | null;

  /** Re-read marketplaces and installed plugins. */
  refreshPlugins: () => void;

  /** Run a plugin action; a blank target lets the host prompt for it. */
  runPluginAction: (action: SquadPluginAction, target?: string) => void;

  /** Re-run the last failed plugin action, or `null` when not retryable. */
  retryLastAction: (() => void) | null;
}

/**
 * Hook to access the plugin management view model and actions.
 */
export function useSquadPlugins(): UseSquadPluginsResult {
  const squad = useSquadState();
  const lastAction = squad.lastPluginAction;
  const feedback = describePluginActionResult(lastAction);

  const runPluginAction = (action: SquadPluginAction, target?: string) => {
    const trimmed = target?.trim();
    squad.runPluginAction(action, trimmed ? trimmed : undefined);
  };

  const inventoryError =
    squad.error && isSquadPluginError(squad.error) && !isSameSquadError(squad.error, lastAction?.error) ? squad.error : null;

  const retryLastAction =
    lastAction && feedback?.tone === "error" ? () => squad.runPluginAction(lastAction.action, lastAction.target) : null;

  return {
    isReady: squad.isReady,
    isBusy: squad.isLoading,
    marketplaces: squad.marketplaces,
    plugins: squad.plugins,
    nexusMarketplaceRegistered: hasNexusMarketplace(squad.marketplaces),
    lastAction,
    feedback,
    inventoryError,
    refreshPlugins: squad.refreshPlugins,
    runPluginAction,
    retryLastAction,
  };
}
