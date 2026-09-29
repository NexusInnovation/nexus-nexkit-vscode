/**
 * GitHub Issues backlog provider (SQD-042, PRD FR-050).
 *
 * Resolves the repository from the workspace git remotes (as Squad does) and
 * verifies the backlog through the user's existing `gh` authentication with a
 * single read-only GraphQL call. No token is read or stored by NexKit.
 *
 * Every failure maps to an actionable {@link SquadError}: `gh` missing,
 * unauthenticated/SSO, rate-limited, repository not found, Issues disabled,
 * GitHub unavailable (5xx/timeouts) — none ever produces a success state.
 */

import {
  SQUAD_BACKLOG_LABEL,
  SQUAD_UNTRIAGED_LABEL,
  SquadBacklogContext,
  SquadBacklogDetectionSource,
  SquadBacklogProvider,
  SquadBacklogProviderId,
  SquadBacklogProviderInfo,
  SquadError,
  SquadGitHubBacklogRef,
  SquadGitRemote,
  SquadResult,
  squadErr,
  squadOk,
} from "../models";
import { ChildProcessSquadRunner, SquadProcessRunner, SquadSpawnResult } from "./squadProcessRunner";

/** Default timeout for the `gh api graphql` verification call. */
const DEFAULT_GH_TIMEOUT_MS = 15000;

/** Longest stderr excerpt kept in {@link SquadError.detail}. */
const MAX_DETAIL_LENGTH = 300;

/** Remote names tried first, in order, before any other remote. */
const PREFERRED_REMOTES = ["origin", "upstream"];

const GH_INSTALL_REMEDIATION =
  "Install the GitHub CLI from https://cli.github.com, run `gh auth login`, then refresh the backlog status.";

/**
 * Read-only query: repository identity plus open, `squad` and
 * `squad:untriaged` issue counts. Owner/name are passed as GraphQL variables
 * (never interpolated) and `-f` raw fields, so `@file` expansion cannot apply.
 */
export const GITHUB_BACKLOG_QUERY =
  "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){" +
  "nameWithOwner url hasIssuesEnabled isArchived " +
  "openIssues:issues(states:OPEN){totalCount} " +
  `squadIssues:issues(states:OPEN,labels:["${SQUAD_BACKLOG_LABEL}"]){totalCount} ` +
  `untriagedIssues:issues(states:OPEN,labels:["${SQUAD_UNTRIAGED_LABEL}"]){totalCount}}}`;

/** A GitHub repository parsed from a git remote. */
export interface ParsedGitHubRemote extends SquadGitHubBacklogRef {
  /** Remote name it was parsed from. */
  remoteName: string;
}

/** Constructor options for {@link GitHubBacklogProvider}. */
export interface GitHubBacklogProviderOptions {
  /** Process runner used to invoke `gh`; defaults to a `shell: false` child-process runner. */
  runner?: SquadProcessRunner;

  /**
   * `gh` executable. Defaults to `gh.exe` on Windows (spawned directly through
   * PATH, never via `cmd.exe`) and `gh` elsewhere.
   */
  ghCommand?: string;

  /** Timeout for the verification call in milliseconds. */
  timeoutMs?: number;
}

/** GitHub Issues implementation of {@link SquadBacklogProvider}. */
export class GitHubBacklogProvider implements SquadBacklogProvider {
  public readonly id = SquadBacklogProviderId.GitHub;
  public readonly displayName = "GitHub Issues";

  private readonly _runner: SquadProcessRunner;
  private readonly _ghCommand: string;
  private readonly _timeoutMs: number;

  constructor(options: GitHubBacklogProviderOptions = {}) {
    this._runner = options.runner ?? new ChildProcessSquadRunner();
    this._ghCommand = options.ghCommand ?? (process.platform === "win32" ? "gh.exe" : "gh");
    this._timeoutMs = options.timeoutMs ?? DEFAULT_GH_TIMEOUT_MS;
  }

  public matches(context: SquadBacklogContext): boolean {
    return context.remotes.some((remote) => {
      const parsed = parseGitHubRemote(remote);
      return parsed !== null && isGitHubHost(parsed.host);
    });
  }

  public async detect(context: SquadBacklogContext): Promise<SquadResult<SquadBacklogProviderInfo>> {
    const repository = selectGitHubRemote(context.remotes, context.source === SquadBacklogDetectionSource.Config);
    if (!repository) {
      return squadErr({
        code: "backlog-unavailable",
        message: "GitHub Issues is configured as the Squad backlog, but no GitHub remote was found in this repository.",
        remediation:
          "Add the GitHub repository as a git remote (e.g. `git remote add origin https://github.com/<owner>/<repo>.git`), then refresh.",
      });
    }

    const result = await this._runner.run({
      command: this._ghCommand,
      args: [
        "api",
        "graphql",
        "--hostname",
        repository.host,
        "-f",
        `query=${GITHUB_BACKLOG_QUERY}`,
        "-f",
        `owner=${repository.owner}`,
        "-f",
        `name=${repository.repo}`,
      ],
      cwd: context.workspaceRoot.fsPath,
      timeoutMs: this._timeoutMs,
      token: context.token,
    });

    const failure = mapGhFailure(result, repository);
    if (failure) {
      return squadErr(failure);
    }

    return parseRepositoryResponse(result.stdout, repository);
  }
}

/** Whether a host is GitHub.com or GitHub Enterprise Cloud (`*.ghe.com`). */
export function isGitHubHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "github.com" || normalized.endsWith(".ghe.com");
}

const SEGMENT_PATTERN = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/;
const HOST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const SCP_REMOTE_PATTERN = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/;

/**
 * Parse `owner/repo` from a git remote URL (HTTPS, SSH, `git://` or scp-like
 * `git@host:owner/repo.git`). Returns `null` when the URL is not a two-segment
 * repository path or contains unsafe characters.
 */
export function parseGitHubRemote(remote: SquadGitRemote): ParsedGitHubRemote | null {
  const url = remote.url.trim();
  let host: string;
  let path: string;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (!["https:", "http:", "ssh:", "git:", "git+ssh:", "ssh+git:"].includes(parsed.protocol)) {
      return null;
    }
    host = parsed.hostname;
    path = decodeURIComponent(parsed.pathname);
  } else {
    const match = SCP_REMOTE_PATTERN.exec(url);
    if (!match) {
      return null;
    }
    host = match[1];
    path = match[2];
  }

  host = host.toLowerCase();
  if (host === "www.github.com" || host === "ssh.github.com") {
    host = "github.com";
  }
  if (!HOST_PATTERN.test(host)) {
    return null;
  }

  const segments = path.replace(/^\/+|\/+$/g, "").split("/");
  if (segments.length !== 2) {
    return null;
  }
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!SEGMENT_PATTERN.test(owner) || !SEGMENT_PATTERN.test(repo) || repo === "." || repo === "..") {
    return null;
  }

  return { host, owner, repo, remoteName: remote.name };
}

/**
 * Pick the backlog repository: preferred remote names first, GitHub hosts
 * only. When the platform is configured explicitly, a non-GitHub.com host
 * (GitHub Enterprise Server) is accepted as a fallback.
 */
export function selectGitHubRemote(remotes: readonly SquadGitRemote[], allowAnyHost: boolean): ParsedGitHubRemote | null {
  const ordered = [...remotes].sort((a, b) => remoteRank(a.name) - remoteRank(b.name));
  const parsed = ordered.map(parseGitHubRemote).filter((remote): remote is ParsedGitHubRemote => remote !== null);
  return parsed.find((remote) => isGitHubHost(remote.host)) ?? (allowAnyHost ? (parsed[0] ?? null) : null);
}

function remoteRank(name: string): number {
  const index = PREFERRED_REMOTES.indexOf(name);
  return index === -1 ? PREFERRED_REMOTES.length : index;
}

/** Map a failed `gh` invocation to an actionable error, or `null` when it succeeded. */
function mapGhFailure(result: SquadSpawnResult, repository: SquadGitHubBacklogRef): SquadError | null {
  const slug = `${repository.owner}/${repository.repo}`;

  if (result.spawnErrorCode) {
    if (result.spawnErrorCode === "ENOENT") {
      return {
        code: "backlog-tool-not-found",
        message: "The GitHub CLI (gh) is not installed or not on PATH, so the GitHub Issues backlog cannot be checked.",
        remediation: GH_INSTALL_REMEDIATION,
      };
    }
    return {
      code: "backlog-unavailable",
      message: "The GitHub CLI (gh) could not be started.",
      remediation: GH_INSTALL_REMEDIATION,
      detail: result.spawnErrorCode,
    };
  }

  if (result.cancelled) {
    return { code: "cancelled", message: "GitHub backlog detection was cancelled." };
  }

  if (result.timedOut) {
    return {
      code: "backlog-unavailable",
      message: `Checking the GitHub Issues backlog for ${slug} timed out.`,
      remediation: "Check your network connection and GitHub status (https://www.githubstatus.com), then refresh.",
    };
  }

  const output = `${result.stderr}\n${result.stdout}`;
  const detail = excerpt(result.stderr || result.stdout);

  if (result.exitCode === 0 && !/"errors"\s*:/.test(result.stdout)) {
    return null;
  }

  if (/rate limit/i.test(output)) {
    return {
      code: "backlog-rate-limited",
      message: "The GitHub API rate limit was exceeded while checking the backlog.",
      remediation: "Wait for the rate limit to reset (usually within an hour), then refresh.",
      detail,
    };
  }

  if (
    result.exitCode === 4 ||
    /gh auth login|not logged in|authentication required|HTTP 401|bad credentials|requires authentication/i.test(output)
  ) {
    return {
      code: "backlog-auth-required",
      message: `The GitHub CLI is not authenticated for ${repository.host}.`,
      remediation: `Run \`gh auth login --hostname ${repository.host}\` in a terminal, then refresh.`,
      detail,
    };
  }

  if (/SAML|SSO|HTTP 403|FORBIDDEN/i.test(output)) {
    return {
      code: "backlog-auth-required",
      message: `GitHub denied access to ${slug}.`,
      remediation:
        "Authorize the GitHub CLI for the organization (`gh auth refresh --hostname " +
        `${repository.host}\`, approving SSO if prompted), or ask an owner for access, then refresh.`,
      detail,
    };
  }

  if (/Could not resolve to a Repository|NOT_FOUND|HTTP 404/i.test(output)) {
    return repositoryNotFound(repository, detail);
  }

  if (/HTTP 5\d\d|Bad Gateway|Service Unavailable|Gateway Time-?out/i.test(output)) {
    return {
      code: "backlog-unavailable",
      message: "GitHub is temporarily unavailable, so the backlog could not be checked.",
      remediation: "Check https://www.githubstatus.com and refresh in a few minutes.",
      detail,
    };
  }

  return {
    code: "backlog-unavailable",
    message: `The GitHub CLI failed to read the GitHub Issues backlog for ${slug}.`,
    remediation: "Run `gh auth status` in a terminal to diagnose, then refresh.",
    detail: detail ?? (result.exitCode === null ? undefined : `exit code ${result.exitCode}`),
  };
}

function repositoryNotFound(repository: SquadGitHubBacklogRef, detail?: string): SquadError {
  return {
    code: "backlog-unavailable",
    message: `The GitHub repository ${repository.owner}/${repository.repo} was not found or is not accessible with your GitHub CLI account.`,
    remediation: "Verify the git remote URL and that `gh auth status` shows an account with access, then refresh.",
    detail,
  };
}

interface GitHubRepositoryPayload {
  nameWithOwner?: unknown;
  url?: unknown;
  hasIssuesEnabled?: unknown;
  isArchived?: unknown;
  openIssues?: { totalCount?: unknown } | null;
  squadIssues?: { totalCount?: unknown } | null;
  untriagedIssues?: { totalCount?: unknown } | null;
}

function parseRepositoryResponse(stdout: string, repository: ParsedGitHubRemote): SquadResult<SquadBacklogProviderInfo> {
  let payload: { data?: { repository?: GitHubRepositoryPayload | null } | null };
  try {
    payload = JSON.parse(stdout) as typeof payload;
  } catch (error) {
    return squadErr({
      code: "parse-failed",
      message: "The GitHub CLI returned an unexpected response while checking the backlog.",
      remediation: "Update the GitHub CLI (`gh --version`) and refresh.",
      detail: error instanceof Error ? error.message : undefined,
    });
  }

  const repo = payload?.data?.repository;
  if (!repo || typeof repo !== "object") {
    return squadErr(repositoryNotFound(repository));
  }

  if (repo.hasIssuesEnabled === false) {
    return squadErr({
      code: "backlog-unavailable",
      message: `GitHub Issues are disabled for ${repository.owner}/${repository.repo}, so it cannot serve as the Squad backlog.`,
      remediation:
        "Enable Issues in the repository settings (Settings → General → Features), or set another `platform` in .squad/config.json.",
    });
  }

  const displayName =
    typeof repo.nameWithOwner === "string" && repo.nameWithOwner ? repo.nameWithOwner : `${repository.owner}/${repository.repo}`;

  return squadOk({
    providerId: SquadBacklogProviderId.GitHub,
    displayName,
    url: typeof repo.url === "string" ? repo.url : null,
    remoteName: repository.remoteName,
    readOnly: repo.isArchived === true,
    itemCounts: {
      open: toCount(repo.openIssues),
      squad: toCount(repo.squadIssues),
      untriaged: toCount(repo.untriagedIssues),
    },
    github: { host: repository.host, owner: repository.owner, repo: repository.repo },
  });
}

function toCount(connection: { totalCount?: unknown } | null | undefined): number | null {
  const value = connection?.totalCount;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function excerpt(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > MAX_DETAIL_LENGTH ? `${trimmed.slice(0, MAX_DETAIL_LENGTH)}…` : trimmed;
}
