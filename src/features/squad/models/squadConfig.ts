/**
 * Cross-cutting Squad configuration shapes: upstream sources, plugin
 * references, per-agent model configuration and Ralph/backlog preferences.
 *
 * These support several PRD epics (FR-030 upstreams, FR-042/FR-043 plugins,
 * FR-063 model config, FR-028/FR-054 Ralph) and are composed by the Squad
 * profile configuration (FR-065). Kept as lean descriptors — the read/write
 * services and CLI wrappers live downstream.
 */

/** Type of an upstream inheritance source (FR-030/FR-031). */
export const SquadUpstreamKind = {
  Local: "local",
  Git: "git",
  Export: "export",
} as const;

export type SquadUpstreamKind = (typeof SquadUpstreamKind)[keyof typeof SquadUpstreamKind];

/**
 * An upstream inheritance source read from `.squad/upstream.json` (FR-030).
 */
export interface SquadUpstreamSource {
  /** Stable identifier / name of the upstream. */
  id: string;

  /** Source kind (local path, git repo, or JSON export). */
  kind: SquadUpstreamKind;

  /** Location reference (path, git URL, or export URL). */
  reference: string;

  /** Last successful sync time (epoch milliseconds), when known. */
  lastSyncedAt?: number;

  /** Git branch/tag tracked by a git upstream (`ref` in the CLI manifest). */
  gitRef?: string;
}

/**
 * Upstream operations NexKit runs through `squad upstream` (FR-031/FR-032).
 * Used by the host service and the webview message contract.
 */
export const SquadUpstreamOperation = {
  List: "list",
  Add: "add",
  Sync: "sync",
  Remove: "remove",
} as const;

export type SquadUpstreamOperation = (typeof SquadUpstreamOperation)[keyof typeof SquadUpstreamOperation];

/** Reference to an installed Squad plugin (FR-042/FR-043). */
export interface SquadPluginRef {
  /** Plugin identifier. */
  id: string;

  /** Marketplace the plugin was resolved from, when applicable. */
  marketplace?: string;

  /** Whether the plugin is currently enabled. */
  enabled: boolean;
}

/**
 * Per-agent model configuration entry mirroring `.squad/model-config.json`
 * (FR-063). Values are opaque model identifiers; NexKit does not validate
 * provider-specific semantics here.
 */
export interface SquadAgentModelConfig {
  /** Agent identifier the model assignment applies to. */
  agentId: string;

  /** Model identifier assigned to the agent. */
  model: string;
}

/** Ralph / backlog automation preferences surfaced in the panel (FR-028). */
export interface SquadRalphPreferences {
  /** Whether `squad watch` should be offered to start automatically. */
  autoStartWatch?: boolean;

  /** Backlog platform in use, when configured (e.g. "github", "ado"). */
  backlogPlatform?: string;
}
