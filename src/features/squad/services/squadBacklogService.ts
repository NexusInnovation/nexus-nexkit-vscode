import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  normalizeSquadBacklogPlatform,
  SquadBacklogConfig,
  SquadBacklogContext,
  SquadBacklogDetected,
  SquadBacklogDetection,
  SquadBacklogDetectionSource,
  SquadBacklogItem,
  SquadBacklogItemQuery,
  SquadBacklogNotDetected,
  SquadBacklogNotDetectedReason,
  SquadBacklogProvider,
  SquadBacklogProviderId,
  SquadWorkState,
  SquadError,
  SquadGitRemote,
  SquadResult,
  squadErr,
  squadOk,
} from "../models";
import { ChildProcessSquadRunner, SquadProcessRunner, SquadSpawnResult } from "./squadProcessRunner";

const DEFAULT_GIT_TIMEOUT_MS = 5000;
const SQUAD_DIR = ".squad";
const SQUAD_CONFIG_FILE = "config.json";

interface GitRemoteRead {
  remotes: readonly SquadGitRemote[];
  noGitRepository: boolean;
}

/** Minimal file-reading seam for backlog config discovery. */
export interface SquadBacklogFileReader {
  /** Whether a file exists at the given URI. */
  exists(uri: vscode.Uri): Promise<boolean>;

  /** Read a file as UTF-8 text. */
  readFile(uri: vscode.Uri): Promise<string>;
}

/** Constructor options for {@link SquadBacklogService}. */
export interface SquadBacklogServiceOptions {
  /** Backlog platform providers, e.g. GitHub Issues and Azure DevOps. */
  providers: readonly SquadBacklogProvider[];

  /** File reader; defaults to a `vscode.workspace.fs`-backed reader. */
  fileReader?: SquadBacklogFileReader;

  /** Process runner used to collect git remotes. */
  runner?: SquadProcessRunner;

  /** Git executable. Defaults to PATH resolution through the shared runner. */
  gitCommand?: string;

  /** Logger for unexpected failures. */
  logger?: LoggingService;

  /** Clock for detection timestamps; defaults to `Date.now`. */
  now?: () => number;

  /** Timeout for `git remote -v`. */
  gitTimeoutMs?: number;
}

/**
 * Detects the configured Squad backlog without blocking extension activation.
 *
 * Platform selection is provider-agnostic: an explicit `.squad/config.json`
 * `platform` wins; otherwise providers inspect git remotes in order. Tool and
 * access failures remain actionable `SquadResult` errors, while a workspace
 * with no supported backlog signal returns a first-class `not-detected` state.
 */
export class SquadBacklogService {
  private readonly _providers: readonly SquadBacklogProvider[];
  private readonly _fileReader: SquadBacklogFileReader;
  private readonly _runner: SquadProcessRunner;
  private readonly _gitCommand: string;
  private readonly _logger: LoggingService;
  private readonly _now: () => number;
  private readonly _gitTimeoutMs: number;

  constructor(options: SquadBacklogServiceOptions) {
    this._providers = options.providers;
    this._fileReader = options.fileReader ?? createDefaultFileReader();
    this._runner = options.runner ?? new ChildProcessSquadRunner();
    this._gitCommand = options.gitCommand ?? "git";
    this._logger = options.logger ?? LoggingService.getInstance();
    this._now = options.now ?? (() => Date.now());
    this._gitTimeoutMs = options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
  }

  /**
   * Detect the Squad backlog for a workspace. Defaults to the first VS Code
   * workspace folder when `workspaceRoot` is omitted.
   */
  public async detect(workspaceRoot?: vscode.Uri, token?: vscode.CancellationToken): Promise<SquadResult<SquadBacklogDetection>> {
    const root = workspaceRoot ?? this._resolveWorkspaceRoot();
    if (!root) {
      return squadErr({
        code: "not-a-workspace",
        message: "No workspace folder is open, so Squad backlog detection cannot run.",
        remediation: "Open a folder or workspace and try again.",
      });
    }

    const configResult = await this._readConfig(root);
    if (!configResult.ok) {
      return configResult;
    }

    const config = configResult.value;
    const remoteResult = await this._readGitRemotes(root, token);
    const remotes = remoteResult.ok ? remoteResult.value.remotes : [];

    if (config.platform) {
      return this._detectConfiguredProvider(root, config, remotes, token);
    }

    if (!remoteResult.ok) {
      return remoteResult;
    }

    return this._detectFromRemotes(root, config, remoteResult.value, token);
  }

  public async listItems(
    query: SquadBacklogItemQuery,
    workspaceRoot?: vscode.Uri,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadBacklogItem[]>> {
    const selected = await this._selectProviderContext(workspaceRoot, token);
    if (!selected.ok) {
      return selected;
    }
    if (!selected.value.provider.listItems) {
      return squadErr({
        code: "backlog-unsupported",
        message: `${selected.value.provider.displayName} does not support backlog item listing in this NexKit build.`,
        remediation: "Update NexKit, or use a supported Squad backlog provider.",
      });
    }
    return selected.value.provider.listItems(selected.value.context, query);
  }

  public async getItem(
    itemId: string,
    workspaceRoot?: vscode.Uri,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadBacklogItem>> {
    const items = await this.listItems({ squadOnly: false, search: itemId, limit: 100 }, workspaceRoot, token);
    if (!items.ok) {
      return items;
    }
    const item = items.value.find((candidate) => candidate.id === itemId || String(candidate.number) === itemId);
    if (!item) {
      return squadErr({
        code: "invalid-input",
        message: "The selected backlog item could not be found.",
        remediation: "Refresh the Squad backlog list, then try again.",
      });
    }
    return squadOk(item);
  }

  public async getWorkState(
    itemId: string,
    branch: string,
    workspaceRoot?: vscode.Uri,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadWorkState>> {
    const selected = await this._selectProviderContext(workspaceRoot, token);
    if (!selected.ok) {
      return selected;
    }
    if (!selected.value.provider.getWorkState) {
      return squadErr({
        code: "backlog-unsupported",
        message: `${selected.value.provider.displayName} does not support work state checks in this NexKit build.`,
        remediation: "Update NexKit, or inspect the issue and pull request manually before cleanup.",
      });
    }
    return selected.value.provider.getWorkState(selected.value.context, itemId, branch);
  }

  private async _detectConfiguredProvider(
    workspaceRoot: vscode.Uri,
    config: SquadBacklogConfig,
    remotes: readonly SquadGitRemote[],
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadBacklogDetection>> {
    const providerId = normalizeSquadBacklogPlatform(config.platform ?? "");
    if (!providerId) {
      return squadErr({
        code: "backlog-unsupported",
        message: `Squad backlog platform "${config.platform}" is not supported by NexKit.`,
        remediation: "Set `.squad/config.json` `platform` to `github` or `azure-devops`, then refresh.",
      });
    }

    const provider = this._providers.find((candidate) => candidate.id === providerId);
    if (!provider) {
      return squadErr({
        code: "backlog-unsupported",
        message: `${displayProviderId(providerId)} backlog detection is not available in this NexKit build.`,
        remediation: "Update NexKit, or choose a backlog platform supported by this version.",
      });
    }

    return this._runProvider(provider, {
      workspaceRoot,
      remotes,
      config,
      source: SquadBacklogDetectionSource.Config,
      token,
    });
  }

  private async _selectProviderContext(
    workspaceRoot?: vscode.Uri,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<{ provider: SquadBacklogProvider; context: SquadBacklogContext }>> {
    const root = workspaceRoot ?? this._resolveWorkspaceRoot();
    if (!root) {
      return squadErr({
        code: "not-a-workspace",
        message: "No workspace folder is open, so Squad backlog operations cannot run.",
        remediation: "Open a folder or workspace and try again.",
      });
    }

    const configResult = await this._readConfig(root);
    if (!configResult.ok) {
      return configResult;
    }

    const remoteResult = await this._readGitRemotes(root, token);
    if (!remoteResult.ok) {
      return remoteResult;
    }

    const config = configResult.value;
    const remotes = remoteResult.value.remotes;
    if (config.platform) {
      const providerId = normalizeSquadBacklogPlatform(config.platform);
      const provider = providerId ? this._providers.find((candidate) => candidate.id === providerId) : undefined;
      if (!provider) {
        return squadErr({
          code: "backlog-unsupported",
          message: `Squad backlog platform "${config.platform}" is not supported by NexKit.`,
          remediation: "Set `.squad/config.json` `platform` to `github` or `azure-devops`, then refresh.",
        });
      }
      return squadOk({
        provider,
        context: { workspaceRoot: root, remotes, config, source: SquadBacklogDetectionSource.Config, token },
      });
    }

    const context: SquadBacklogContext = {
      workspaceRoot: root,
      remotes,
      config,
      source: SquadBacklogDetectionSource.GitRemote,
      token,
    };
    const provider = this._providers.find((candidate) => candidate.matches(context));
    if (!provider) {
      return squadErr({
        code: "backlog-unsupported",
        message: "NexKit could not infer a supported Squad backlog from this repository.",
        remediation: "Configure `.squad/config.json` with `platform: \"github\"` or `platform: \"azure-devops\"`, then refresh.",
      });
    }
    return squadOk({ provider, context });
  }

  private async _detectFromRemotes(
    workspaceRoot: vscode.Uri,
    config: SquadBacklogConfig,
    remoteRead: GitRemoteRead,
    token?: vscode.CancellationToken
  ): Promise<SquadResult<SquadBacklogDetection>> {
    if (remoteRead.noGitRepository) {
      return squadOk(this._notDetected(SquadBacklogNotDetectedReason.NoGitRepository));
    }

    const remotes = remoteRead.remotes;
    if (remotes.length === 0) {
      return squadOk(this._notDetected(SquadBacklogNotDetectedReason.NoRemote));
    }

    const baseContext: SquadBacklogContext = {
      workspaceRoot,
      remotes,
      config,
      source: SquadBacklogDetectionSource.GitRemote,
      token,
    };
    const provider = this._providers.find((candidate) => candidate.matches(baseContext));
    if (!provider) {
      return squadOk(this._notDetected(SquadBacklogNotDetectedReason.UnrecognizedRemote));
    }

    return this._runProvider(provider, baseContext);
  }

  private async _runProvider(
    provider: SquadBacklogProvider,
    context: SquadBacklogContext
  ): Promise<SquadResult<SquadBacklogDetection>> {
    try {
      const result = await provider.detect(context);
      if (!result.ok) {
        return result;
      }

      const detected: SquadBacklogDetected = {
        status: "detected",
        backlog: { ...result.value, source: context.source },
        detectedAt: this._now(),
      };
      return squadOk(detected);
    } catch (error) {
      this._logger.error(`Squad backlog provider "${provider.id}" threw during detection.`, error);
      return squadErr({
        code: "backlog-unavailable",
        message: `${provider.displayName} backlog detection failed unexpectedly.`,
        remediation: "Check the Nexkit output channel for details, then refresh the backlog status.",
        detail: error instanceof Error ? error.message : undefined,
        cause: error,
      });
    }
  }

  private async _readConfig(root: vscode.Uri): Promise<SquadResult<SquadBacklogConfig>> {
    const uri = vscode.Uri.joinPath(root, SQUAD_DIR, SQUAD_CONFIG_FILE);
    let exists = false;
    try {
      exists = await this._fileReader.exists(uri);
    } catch (error) {
      return this._configReadError(error);
    }

    if (!exists) {
      return squadOk({ platform: null, raw: null });
    }

    let rawText: string;
    try {
      rawText = await this._fileReader.readFile(uri);
    } catch (error) {
      return this._configReadError(error);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      return squadErr({
        code: "parse-failed",
        message: ".squad/config.json could not be parsed, so Squad backlog detection cannot run.",
        remediation: "Fix the JSON syntax in .squad/config.json, then refresh the backlog status.",
        detail: error instanceof Error ? error.message : undefined,
        cause: error,
      });
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return squadErr({
        code: "parse-failed",
        message: ".squad/config.json must contain a JSON object.",
        remediation: "Update .squad/config.json to use an object with an optional `platform` property.",
      });
    }

    const platformValue = (parsed as { platform?: unknown }).platform;
    if (platformValue !== undefined && platformValue !== null && typeof platformValue !== "string") {
      return squadErr({
        code: "parse-failed",
        message: ".squad/config.json `platform` must be a string when present.",
        remediation: "Set `platform` to `github` or `azure-devops`, or remove the property.",
      });
    }

    const platform = typeof platformValue === "string" && platformValue.trim() ? platformValue : null;
    return squadOk({ platform, raw: parsed as Readonly<Record<string, unknown>> });
  }

  private _configReadError(error: unknown): SquadResult<SquadBacklogConfig> {
    return squadErr({
      code: "file-read-failed",
      message: ".squad/config.json could not be read, so Squad backlog detection cannot run.",
      remediation: "Verify the file is accessible, then refresh the backlog status.",
      detail: error instanceof Error ? error.message : undefined,
      cause: error,
    });
  }

  private async _readGitRemotes(root: vscode.Uri, token?: vscode.CancellationToken): Promise<SquadResult<GitRemoteRead>> {
    const result = await this._runner.run({
      command: this._gitCommand,
      args: ["remote", "-v"],
      cwd: root.fsPath,
      timeoutMs: this._gitTimeoutMs,
      token,
    });

    const failure = mapGitRemoteFailure(result);
    if (failure) {
      if (isNoGitRepositoryFailure(failure)) {
        return squadOk({ remotes: [], noGitRepository: true });
      }
      return squadErr(failure);
    }

    return squadOk({ remotes: parseGitRemotes(result.stdout), noGitRepository: false });
  }

  private _notDetected(reason: SquadBacklogNotDetectedReason): SquadBacklogNotDetected {
    const guidance = notDetectedGuidance(reason);
    return {
      status: "not-detected",
      reason,
      message: guidance.message,
      remediation: guidance.remediation,
      detectedAt: this._now(),
    };
  }

  private _resolveWorkspaceRoot(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }
}

/** Parse fetch remotes from `git remote -v` output while preserving order. */
export function parseGitRemotes(stdout: string): SquadGitRemote[] {
  const remotes: SquadGitRemote[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch)\)$/.exec(line.trim());
    if (!match) {
      continue;
    }

    const key = `${match[1]}\n${match[2]}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    remotes.push({ name: match[1], url: match[2] });
  }
  return remotes;
}

function mapGitRemoteFailure(result: SquadSpawnResult): SquadError | null {
  if (result.spawnErrorCode) {
    return {
      code: "backlog-tool-not-found",
      message: "Git is not installed or not on PATH, so Squad backlog detection cannot inspect remotes.",
      remediation: "Install Git or open a workspace where git remotes are already configured, then refresh.",
      detail: result.spawnErrorCode,
    };
  }

  if (result.cancelled) {
    return { code: "cancelled", message: "Squad backlog detection was cancelled." };
  }

  if (result.timedOut) {
    return {
      code: "backlog-unavailable",
      message: "Reading git remotes timed out while detecting the Squad backlog.",
      remediation: "Verify git is responsive in this workspace, then refresh.",
    };
  }

  if (result.exitCode === 0) {
    return null;
  }

  const output = `${result.stderr}\n${result.stdout}`;
  if (/not a git repository/i.test(output)) {
    return {
      code: "backlog-unavailable",
      message: "The workspace is not a git repository.",
      detail: SquadBacklogNotDetectedReason.NoGitRepository,
    };
  }

  return {
    code: "backlog-unavailable",
    message: "Git remotes could not be read while detecting the Squad backlog.",
    remediation: "Run `git remote -v` in the workspace to diagnose, then refresh.",
    detail: excerpt(result.stderr || result.stdout),
  };
}

function isNoGitRepositoryFailure(error: SquadError): boolean {
  return error.detail === SquadBacklogNotDetectedReason.NoGitRepository;
}

function notDetectedGuidance(reason: SquadBacklogNotDetectedReason): { message: string; remediation: string } {
  switch (reason) {
    case SquadBacklogNotDetectedReason.NoGitRepository:
      return {
        message: "No Squad backlog was detected because the workspace is not a git repository.",
        remediation: "Open a git repository, or configure `.squad/config.json` with a supported `platform`.",
      };
    case SquadBacklogNotDetectedReason.NoRemote:
      return {
        message: "No Squad backlog was detected because this repository has no git remotes.",
        remediation: "Add a GitHub remote or configure `.squad/config.json` with a supported `platform`.",
      };
    case SquadBacklogNotDetectedReason.UnrecognizedRemote:
      return {
        message: "No supported Squad backlog was detected from the configured git remotes.",
        remediation: "Use a GitHub remote, or set `.squad/config.json` `platform` to a supported backlog provider.",
      };
  }
}

function displayProviderId(providerId: SquadBacklogProviderId): string {
  return providerId === SquadBacklogProviderId.GitHub ? "GitHub Issues" : "Azure DevOps";
}

function excerpt(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}

function createDefaultFileReader(): SquadBacklogFileReader {
  return {
    async exists(uri: vscode.Uri): Promise<boolean> {
      try {
        await vscode.workspace.fs.stat(uri);
        return true;
      } catch {
        return false;
      }
    },
    async readFile(uri: vscode.Uri): Promise<string> {
      const data = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(data).toString("utf8");
    },
  };
}
