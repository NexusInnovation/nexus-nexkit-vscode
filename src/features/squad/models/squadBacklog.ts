/**
 * Provider-agnostic Squad backlog contract (SQD-042, PRD FR-050).
 *
 * Squad drives Ralph/triage from a backlog platform: GitHub Issues (via `gh`)
 * or Azure DevOps (via `az`, SQD-043). NexKit mirrors Squad's own resolution:
 * an explicit `platform` in `.squad/config.json` wins, otherwise the backlog
 * is inferred from the workspace git remotes.
 *
 * Every backlog platform plugs in through {@link SquadBacklogProvider}; the
 * orchestrating `SquadBacklogService` owns config/remote discovery and
 * provider selection so providers only verify their own platform. Downstream
 * work (#258 Azure DevOps, #259 status UI, #268 worktree-per-issue) consumes
 * these types rather than any provider-specific shape.
 */

import type * as vscode from "vscode";
import type { SquadResult } from "./squadResult";

/** Backlog platforms NexKit knows about (FR-050/FR-051). */
export const SquadBacklogProviderId = {
  GitHub: "github",
  AzureDevOps: "azure-devops",
} as const;

export type SquadBacklogProviderId = (typeof SquadBacklogProviderId)[keyof typeof SquadBacklogProviderId];

/** How the backlog platform was selected. */
export const SquadBacklogDetectionSource = {
  /** Explicit `platform` field in `.squad/config.json`. */
  Config: "config",
  /** Inferred from the workspace git remotes (Squad's default behaviour). */
  GitRemote: "git-remote",
} as const;

export type SquadBacklogDetectionSource = (typeof SquadBacklogDetectionSource)[keyof typeof SquadBacklogDetectionSource];

/** Why no backlog was detected. Not an error: the workspace simply has no backlog signal. */
export const SquadBacklogNotDetectedReason = {
  /** The workspace is not a git repository and no platform is configured. */
  NoGitRepository: "no-git-repository",
  /** The repository has no remotes and no platform is configured. */
  NoRemote: "no-remote",
  /** Remotes exist but none belongs to a supported backlog platform. */
  UnrecognizedRemote: "unrecognized-remote",
} as const;

export type SquadBacklogNotDetectedReason = (typeof SquadBacklogNotDetectedReason)[keyof typeof SquadBacklogNotDetectedReason];

/** Label Squad applies to every issue it owns (`squad`). */
export const SQUAD_BACKLOG_LABEL = "squad";

/** Label Ralph uses for issues awaiting triage (`squad:untriaged`). */
export const SQUAD_UNTRIAGED_LABEL = "squad:untriaged";

/** A configured git remote (fetch URL). */
export interface SquadGitRemote {
  /** Remote name, e.g. `origin`. */
  name: string;

  /** Fetch URL as reported by `git remote -v`. */
  url: string;
}

/** Backlog-relevant view of `.squad/config.json`. */
export interface SquadBacklogConfig {
  /** Raw `platform` value, or `null` when absent/empty. */
  platform: string | null;

  /**
   * The parsed config object, or `null` when `.squad/config.json` is absent.
   * Providers read their own sections from it (e.g. `ado` for SQD-043) so the
   * contract stays provider-agnostic.
   */
  raw: Readonly<Record<string, unknown>> | null;
}

/** Inputs handed to a {@link SquadBacklogProvider}. */
export interface SquadBacklogContext {
  /** Workspace root the backlog belongs to. */
  workspaceRoot: vscode.Uri;

  /** Git remotes of the workspace (fetch URLs), in `git remote` order. */
  remotes: readonly SquadGitRemote[];

  /** Backlog-relevant Squad configuration. */
  config: SquadBacklogConfig;

  /** Whether the provider was selected explicitly by config or inferred from a remote. */
  source: SquadBacklogDetectionSource;

  /** Optional cancellation token for provider I/O. */
  token?: vscode.CancellationToken;
}

/** Open work item counts; `null` when the provider could not determine a count. */
export interface SquadBacklogItemCounts {
  /** All open items (issues / work items). */
  open: number | null;

  /** Open items labelled/tagged for Squad ({@link SQUAD_BACKLOG_LABEL}). */
  squad: number | null;

  /** Open items awaiting Ralph triage ({@link SQUAD_UNTRIAGED_LABEL}). */
  untriaged: number | null;
}

/** GitHub-specific coordinates of a GitHub Issues backlog. */
export interface SquadGitHubBacklogRef {
  /** GitHub host, e.g. `github.com` or a GHE host. */
  host: string;

  /** Repository owner (user or organization). */
  owner: string;

  /** Repository name. */
  repo: string;
}

/** A verified, reachable backlog. */
export interface SquadBacklogInfo {
  /** Platform serving the backlog. */
  providerId: SquadBacklogProviderId;

  /** How the platform was selected. */
  source: SquadBacklogDetectionSource;

  /** Human-readable backlog name, e.g. `owner/repo`. */
  displayName: string;

  /** Web URL of the backlog, when known. */
  url: string | null;

  /** Git remote the backlog was resolved from, when applicable. */
  remoteName: string | null;

  /** Whether the backlog is read-only (e.g. an archived repository). */
  readOnly: boolean;

  /** Open item counts. */
  itemCounts: SquadBacklogItemCounts;

  /** GitHub coordinates when {@link providerId} is `github`. */
  github?: SquadGitHubBacklogRef;
}

/** What a provider returns; the service stamps {@link SquadBacklogInfo.source}. */
export type SquadBacklogProviderInfo = Omit<SquadBacklogInfo, "source">;

/** A backlog platform was found and verified. */
export interface SquadBacklogDetected {
  status: "detected";
  backlog: SquadBacklogInfo;
  /** Epoch milliseconds of the detection. */
  detectedAt: number;
}

/**
 * No backlog signal was found. This is a valid state (like an absent CLI),
 * never a failure; it always carries guidance on how to configure one.
 */
export interface SquadBacklogNotDetected {
  status: "not-detected";
  reason: SquadBacklogNotDetectedReason;
  message: string;
  remediation: string;
  /** Epoch milliseconds of the detection. */
  detectedAt: number;
}

/**
 * Outcome of backlog detection. Failures (tool missing, unauthenticated,
 * unreachable, rate-limited, unsupported platform) are `SquadResult` errors,
 * never one of these states.
 */
export type SquadBacklogDetection = SquadBacklogDetected | SquadBacklogNotDetected;

/**
 * A backlog platform implementation (GitHub Issues now, Azure DevOps in
 * SQD-043). Providers must not throw: every failure is an actionable
 * {@link SquadResult} error and must never degrade into a success.
 */
export interface SquadBacklogProvider {
  /** Stable platform identifier. */
  readonly id: SquadBacklogProviderId;

  /** User-facing platform name, e.g. `GitHub Issues`. */
  readonly displayName: string;

  /**
   * Offline, side-effect-free check used for auto-detection: does the
   * workspace (typically a git remote) belong to this platform? Not called
   * when `.squad/config.json` selects the platform explicitly.
   */
  matches(context: SquadBacklogContext): boolean;

  /** Resolve and verify access to the backlog through the platform tooling. */
  detect(context: SquadBacklogContext): Promise<SquadResult<SquadBacklogProviderInfo>>;
}

const PLATFORM_ALIASES: Readonly<Record<string, SquadBacklogProviderId>> = {
  github: SquadBacklogProviderId.GitHub,
  "github-issues": SquadBacklogProviderId.GitHub,
  gh: SquadBacklogProviderId.GitHub,
  "azure-devops": SquadBacklogProviderId.AzureDevOps,
  azuredevops: SquadBacklogProviderId.AzureDevOps,
  ado: SquadBacklogProviderId.AzureDevOps,
  azdo: SquadBacklogProviderId.AzureDevOps,
};

/**
 * Map a `.squad/config.json` `platform` value to a known provider id, or
 * `null` when the platform is unknown/unsupported (e.g. Jira, FR-053).
 */
export function normalizeSquadBacklogPlatform(platform: string): SquadBacklogProviderId | null {
  const key = platform
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return PLATFORM_ALIASES[key] ?? null;
}
