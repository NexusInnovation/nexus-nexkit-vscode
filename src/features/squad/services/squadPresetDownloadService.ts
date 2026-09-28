/**
 * Downloads a Squad preset's reserved `squad/` folder from a GitHub source and
 * validates it against the SQD-015 preset contract.
 *
 * Implements SQD-016 (PRD FR-011: reserved `squad/` sub-folder per team plugin;
 * FR-013: recursive download of that folder). It reuses the generalized
 * {@link GitHubRecursiveDownloader} extracted from the AI-template provider, then
 * feeds the downloaded listing to {@link validateSquadPresetAsResult} so callers
 * receive a {@link SquadResult} — success carries the built {@link SquadPreset}
 * plus the downloaded files (for SQD-020 init to write), failures carry an
 * actionable, non-silent {@link SquadError}.
 */

import type { LoggingService } from "../../../shared/services/loggingService";
import {
  GitHubApiError,
  GitHubDownloaderLogger,
  GitHubRecursiveDownloader,
  RecursiveDownloadResult,
} from "../../../shared/utils/githubRecursiveDownloader";
import { SquadPreset, SquadPresetSource } from "../models/squadPreset";
import { SquadPresetValidation } from "../models/squadPresetValidation";
import { SquadError, squadErr, SquadResult } from "../models/squadResult";
import { validateSquadPreset, validateSquadPresetAsResult } from "../validation/squadPresetValidator";

/**
 * Lazily resolve the shared {@link LoggingService} without importing `vscode`
 * at module load, so this service (and its unit tests) stay `vscode`-free.
 */
function loadDefaultLogger(): GitHubDownloaderLogger {
  const loggingModule = require("../../../shared/services/loggingService") as {
    LoggingService: { getInstance(): LoggingService };
  };
  return loggingModule.LoggingService.getInstance();
}

/** Successful outcome of downloading and validating a preset's `squad/` folder. */
export interface SquadPresetDownload {
  /** The validated preset descriptor. */
  preset: SquadPreset;
  /**
   * Downloaded files keyed by their path relative to the `squad/` folder root
   * (e.g. `manifest.json`, `agents/link/charter.md`).
   */
  files: Map<string, string>;
  /** The full validation report (may carry non-blocking warnings). */
  validation: SquadPresetValidation;
}

/** A GitHub location for a preset's `squad/` folder. */
interface GitHubSquadLocation {
  owner: string;
  repo: string;
  folderPath: string;
  branch?: string;
}

export interface SquadPresetDownloadServiceDeps {
  /** Injectable downloader seam for tests. */
  downloader?: GitHubRecursiveDownloader;
  logging?: GitHubDownloaderLogger;
}

/**
 * Fetches and validates Squad presets hosted in GitHub repositories.
 */
export class SquadPresetDownloadService {
  private readonly _downloader: GitHubRecursiveDownloader;
  private readonly _logging: GitHubDownloaderLogger;

  constructor(deps: SquadPresetDownloadServiceDeps = {}) {
    this._logging = deps.logging ?? loadDefaultLogger();
    this._downloader =
      deps.downloader ??
      new GitHubRecursiveDownloader({
        getHeaders: () => this.getAuthHeaders(),
        logging: this._logging,
      });
  }

  /**
   * Recursively download a preset's `squad/` folder and validate it against the
   * SQD-015 preset contract.
   *
   * @returns `squadOk` with the built preset and downloaded files when the
   * folder satisfies the contract; otherwise `squadErr` — `preset-fetch-failed`
   * for download/network failures, `preset-invalid` for contract violations.
   */
  public async downloadPreset(source: SquadPresetSource): Promise<SquadResult<SquadPresetDownload>> {
    const location = this.resolveLocation(source);
    if (!location.ok) {
      return location;
    }

    let download: RecursiveDownloadResult;
    try {
      this._logging.info(`[Squad] Downloading preset squad/ folder`, {
        pluginId: source.pluginId,
        repository: source.repository,
        folderPath: location.value.folderPath,
      });

      download = await this._downloader.downloadFolder({
        owner: location.value.owner,
        repo: location.value.repo,
        path: location.value.folderPath,
        ...(location.value.branch ? { branch: location.value.branch } : {}),
      });
    } catch (error) {
      return squadErr(this.toFetchError(error, source));
    }

    const validationInput = {
      paths: [...download.files.keys(), ...download.symlinks],
      readTextFile: (relativePath: string) => download.files.get(relativePath),
      symlinkPaths: download.symlinks,
      source,
    };

    const validation = validateSquadPreset(validationInput);
    const result = validateSquadPresetAsResult(validationInput);

    if (!result.ok) {
      this._logging.warn(`[Squad] Preset failed contract validation`, {
        pluginId: source.pluginId,
        code: result.error.code,
      });
      return result;
    }

    this._logging.info(`[Squad] Preset downloaded and validated`, {
      pluginId: source.pluginId,
      presetId: result.value.id,
      fileCount: download.fileCount,
      warningCount: validation.diagnostics.length,
    });

    return {
      ok: true,
      value: {
        preset: result.value,
        files: download.files,
        validation,
      },
    };
  }

  /** Resolve the GitHub owner/repo/folder for a preset source. */
  private resolveLocation(source: SquadPresetSource): SquadResult<GitHubSquadLocation> {
    if (!source.repository) {
      return squadErr({
        code: "preset-fetch-failed",
        message: "This preset has no GitHub repository configured.",
        remediation: "Set the preset source repository (owner/repo) before downloading.",
      });
    }

    const parsed = parseOwnerRepo(source.repository);
    if (!parsed) {
      return squadErr({
        code: "preset-fetch-failed",
        message: `Invalid GitHub repository reference: '${source.repository}'.`,
        remediation: "Use an 'owner/repo' reference or a github.com repository URL.",
      });
    }

    const folderPath = source.squadFolderPath?.trim() ? source.squadFolderPath : "squad";

    return {
      ok: true,
      value: {
        owner: parsed.owner,
        repo: parsed.repo,
        folderPath,
        ...(parsed.branch ? { branch: parsed.branch } : {}),
      },
    };
  }

  private toFetchError(error: unknown, source: SquadPresetSource): SquadError {
    if (error instanceof GitHubApiError) {
      this._logging.error(`[Squad] Preset download failed`, {
        pluginId: source.pluginId,
        status: error.status,
        isRateLimit: error.isRateLimit,
      });
      return {
        code: "preset-fetch-failed",
        message: `Failed to download preset '${source.pluginId}' from GitHub (HTTP ${error.status}).`,
        remediation: error.remediation,
        detail: error.message,
        cause: error,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    this._logging.error(`[Squad] Preset download failed`, { pluginId: source.pluginId, error: message });
    return {
      code: "preset-fetch-failed",
      message: `Failed to download preset '${source.pluginId}' from GitHub.`,
      remediation: "Check your network connection and GitHub access, then retry.",
      detail: message,
      cause: error,
    };
  }

  /** GitHub API headers with authentication and a required User-Agent. */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const { GitHubAuthHelper } = await import("../../../shared/utils/githubAuthHelper");
    return GitHubAuthHelper.getAuthHeaders(["repo"], "Nexkit-VSCode-Extension", false);
  }
}

/** Parse an `owner/repo`, `owner/repo#branch`, or github.com URL reference. */
function parseOwnerRepo(reference: string): { owner: string; repo: string; branch?: string } | undefined {  const trimmed = reference.trim();

  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/#]+)/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/i, "") };
  }

  const shorthand = trimmed.match(/^([^/#\s]+)\/([^/#\s]+)(?:#(.+))?$/);
  if (shorthand) {
    return {
      owner: shorthand[1],
      repo: shorthand[2].replace(/\.git$/i, ""),
      ...(shorthand[3] ? { branch: shorthand[3] } : {}),
    };
  }

  return undefined;
}
