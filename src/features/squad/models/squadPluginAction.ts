/**
 * Squad plugin marketplace and lifecycle action contract (SQD-039).
 *
 * Covers PRD FR-040 (pre-register the Nexus marketplace on request), FR-041
 * (register any marketplace through `squad plugin marketplace add`) and FR-044
 * (validate / dry-run / install / enable / disable / uninstall / refresh with
 * confirmation for write operations). Kept serialisable and free of
 * extension-host dependencies so the webview can import it type-only.
 */

/** Default Nexus marketplace pre-registered by FR-040. */
export const NEXUS_SQUAD_MARKETPLACE_REPO = "NexusInnovation/nexus-plugin-marketplace";

/** Plugin marketplace and lifecycle actions NexKit can run through the Squad CLI. */
export const SquadPluginAction = {
  /** `squad plugin marketplace add <NexusInnovation/nexus-plugin-marketplace>` (FR-040). */
  AddNexusMarketplace: "marketplace-add-nexus",
  /** `squad plugin marketplace add <owner/repo>` (FR-041). */
  AddMarketplace: "marketplace-add",
  /** `squad plugin marketplace remove <name>`. */
  RemoveMarketplace: "marketplace-remove",
  /** `squad plugin validate <local-plugin-dir>` (read-only). */
  Validate: "validate",
  /** `squad plugin dry-run <local-plugin-dir>` (read-only). */
  DryRun: "dry-run",
  /** `squad plugin install <local-plugin-dir>`. */
  Install: "install",
  /** `squad plugin enable <plugin-id>`. */
  Enable: "enable",
  /** `squad plugin disable <plugin-id>`. */
  Disable: "disable",
  /** `squad plugin uninstall <plugin-id>`. */
  Uninstall: "uninstall",
  /** `squad plugin refresh <plugin-id>` (runs the `onMemoryRefresh` lifecycle). */
  Refresh: "refresh",
} as const;

export type SquadPluginAction = (typeof SquadPluginAction)[keyof typeof SquadPluginAction];

/** What kind of operand an action expects. */
export const SquadPluginActionTargetKind = {
  /** No operand (the action resolves its own target). */
  None: "none",
  /** A marketplace repository reference (`owner/repo`). */
  MarketplaceSource: "marketplace-source",
  /** A registered marketplace name. */
  MarketplaceName: "marketplace-name",
  /** A local plugin directory. */
  PluginDirectory: "plugin-directory",
  /** An installed plugin identifier. */
  PluginId: "plugin-id",
} as const;

export type SquadPluginActionTargetKind =
  (typeof SquadPluginActionTargetKind)[keyof typeof SquadPluginActionTargetKind];

/** Static description of an action: its operand and whether it writes. */
export interface SquadPluginActionDescriptor {
  /** The action. */
  action: SquadPluginAction;

  /** Short user-facing label, e.g. "Install plugin". */
  label: string;

  /** Operand kind expected by the action. */
  targetKind: SquadPluginActionTargetKind;

  /** Whether the action mutates `.squad/` and therefore needs confirmation + backup. */
  writes: boolean;

  /** Whether the action removes something (stronger confirmation wording). */
  destructive: boolean;
}

/** Descriptor table for every {@link SquadPluginAction}. */
export const SQUAD_PLUGIN_ACTIONS: Readonly<Record<SquadPluginAction, SquadPluginActionDescriptor>> = {
  [SquadPluginAction.AddNexusMarketplace]: {
    action: SquadPluginAction.AddNexusMarketplace,
    label: "Register the Nexus marketplace",
    targetKind: SquadPluginActionTargetKind.None,
    writes: true,
    destructive: false,
  },
  [SquadPluginAction.AddMarketplace]: {
    action: SquadPluginAction.AddMarketplace,
    label: "Register marketplace",
    targetKind: SquadPluginActionTargetKind.MarketplaceSource,
    writes: true,
    destructive: false,
  },
  [SquadPluginAction.RemoveMarketplace]: {
    action: SquadPluginAction.RemoveMarketplace,
    label: "Remove marketplace",
    targetKind: SquadPluginActionTargetKind.MarketplaceName,
    writes: true,
    destructive: true,
  },
  [SquadPluginAction.Validate]: {
    action: SquadPluginAction.Validate,
    label: "Validate plugin",
    targetKind: SquadPluginActionTargetKind.PluginDirectory,
    writes: false,
    destructive: false,
  },
  [SquadPluginAction.DryRun]: {
    action: SquadPluginAction.DryRun,
    label: "Dry-run plugin install",
    targetKind: SquadPluginActionTargetKind.PluginDirectory,
    writes: false,
    destructive: false,
  },
  [SquadPluginAction.Install]: {
    action: SquadPluginAction.Install,
    label: "Install plugin",
    targetKind: SquadPluginActionTargetKind.PluginDirectory,
    writes: true,
    destructive: false,
  },
  [SquadPluginAction.Enable]: {
    action: SquadPluginAction.Enable,
    label: "Enable plugin",
    targetKind: SquadPluginActionTargetKind.PluginId,
    writes: true,
    destructive: false,
  },
  [SquadPluginAction.Disable]: {
    action: SquadPluginAction.Disable,
    label: "Disable plugin",
    targetKind: SquadPluginActionTargetKind.PluginId,
    writes: true,
    destructive: false,
  },
  [SquadPluginAction.Uninstall]: {
    action: SquadPluginAction.Uninstall,
    label: "Uninstall plugin",
    targetKind: SquadPluginActionTargetKind.PluginId,
    writes: true,
    destructive: true,
  },
  [SquadPluginAction.Refresh]: {
    action: SquadPluginAction.Refresh,
    label: "Refresh plugin",
    targetKind: SquadPluginActionTargetKind.PluginId,
    writes: true,
    destructive: false,
  },
};

/** Webview → host request to run a plugin action. */
export interface SquadPluginActionRequest {
  /** The action to run. */
  action: SquadPluginAction;

  /**
   * Operand for the action (marketplace source/name, plugin directory or
   * plugin id). Optional for actions whose target the host can prompt for.
   */
  target?: string;
}

/** Successful outcome of a plugin action. */
export interface SquadPluginActionOutcome {
  /** The action that ran. */
  action: SquadPluginAction;

  /** The resolved operand the CLI was invoked with (empty when none). */
  target: string;

  /** Whether the Squad state was changed (false for read-only or no-op actions). */
  changed: boolean;

  /** Whether a backup of the Squad artifacts was taken before the change. */
  backedUp: boolean;

  /** User-facing CLI output (ANSI stripped), e.g. the validation or dry-run plan. */
  output: string;
}
