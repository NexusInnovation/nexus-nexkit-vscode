import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SquadDetectionResult,
  SquadResult,
  SquadUpdateCandidate,
  SquadUpdateTarget,
  SquadUpdatesResult,
  SquadUpgradeCommand,
  SQUAD_SOURCE_VERSION,
  SquadVersionStatus,
  squadErr,
  squadOk,
} from "../models";
import { SquadDetectionService } from "./squadDetectionService";
import { SQUAD_CLI_NPX_PACKAGE } from "./squadCliService";

const NPM_PACKAGE_METADATA_URL = "https://registry.npmjs.org/@bradygaster%2Fsquad-cli/latest";
const DEFAULT_USER_AGENT = "nexus-nexkit-vscode";

/** Minimal fetch response seam for npm registry calls. */
export interface SquadUpdateFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
}

/** Minimal fetch seam for tests and production. */
export type SquadUpdateFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<SquadUpdateFetchResponse>;

/** Source of latest Squad CLI/project versions. */
export interface SquadLatestVersionProvider {
  getLatestCliVersion(): Promise<SquadResult<string>>;
  getLatestProjectVersion(): Promise<SquadResult<string>>;
}

/** Detection seam consumed by update checks. */
export interface SquadUpdateDetectionProvider {
  detect(workspaceRoot?: vscode.Uri): Promise<SquadResult<SquadDetectionResult>>;
}

/** Constructor options for {@link NpmSquadLatestVersionProvider}. */
export interface NpmSquadLatestVersionProviderOptions {
  fetchFn?: SquadUpdateFetch;
  logger?: LoggingService;
  userAgent?: string;
}

/**
 * Reads the published `@bradygaster/squad-cli` latest version from npm. Squad
 * project files and the CLI are versioned together, so both latest-version
 * methods intentionally share the same package metadata lookup.
 */
export class NpmSquadLatestVersionProvider implements SquadLatestVersionProvider {
  private readonly _fetch: SquadUpdateFetch;
  private readonly _logger: LoggingService;
  private readonly _userAgent: string;
  private _latestVersionPromise: Promise<SquadResult<string>> | undefined;

  constructor(options: NpmSquadLatestVersionProviderOptions = {}) {
    this._fetch = options.fetchFn ?? ((url, init) => fetch(url, init) as unknown as Promise<SquadUpdateFetchResponse>);
    this._logger = options.logger ?? LoggingService.getInstance();
    this._userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  public async getLatestCliVersion(): Promise<SquadResult<string>> {
    return this._getLatestVersion();
  }

  public async getLatestProjectVersion(): Promise<SquadResult<string>> {
    return this._getLatestVersion();
  }

  private async _getLatestVersion(): Promise<SquadResult<string>> {
    this._latestVersionPromise ??= this._fetchLatestVersion();
    const result = await this._latestVersionPromise;
    if (!result.ok) {
      this._latestVersionPromise = undefined;
    }
    return result;
  }

  private async _fetchLatestVersion(): Promise<SquadResult<string>> {
    let response: SquadUpdateFetchResponse;
    try {
      response = await this._fetch(NPM_PACKAGE_METADATA_URL, {
        headers: {
          Accept: "application/json",
          "User-Agent": this._userAgent,
        },
      });
    } catch (error) {
      this._logger.warn("Squad update check failed while contacting npm.", error);
      return squadErr({
        code: "update-check-failed",
        message: "The latest Squad version could not be checked.",
        remediation: "Verify network access to the npm registry, then try checking Squad updates again.",
        cause: error,
      });
    }

    if (!response.ok) {
      return squadErr({
        code: "update-check-failed",
        message: "The latest Squad version could not be checked.",
        remediation: this._httpRemediation(response),
        detail: `status=${response.status} ${response.statusText}`,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      return squadErr({
        code: "update-check-failed",
        message: "The npm registry response for Squad updates could not be parsed.",
        remediation: "Try checking Squad updates again. If the problem persists, inspect the Nexkit output channel.",
        cause: error,
      });
    }

    const version = this._readVersion(payload);
    if (!version) {
      return squadErr({
        code: "version-unknown",
        message: "The latest Squad version could not be determined from npm.",
        remediation: `Verify the ${SQUAD_CLI_NPX_PACKAGE} package publishes a valid latest version.`,
      });
    }

    return squadOk(version);
  }

  private _readVersion(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const version = (payload as { version?: unknown }).version;
    if (typeof version !== "string") {
      return null;
    }
    return isComparableVersion(version) ? version : null;
  }

  private _httpRemediation(response: SquadUpdateFetchResponse): string {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (response.status === 429 || (response.status === 403 && remaining === "0")) {
      return "The npm registry rate limit was reached. Wait for the limit to reset, then try again.";
    }
    if (response.status === 404) {
      return `Verify the ${SQUAD_CLI_NPX_PACKAGE} package is available on npm.`;
    }
    return "Verify network access to the npm registry, then try checking Squad updates again.";
  }
}

/** Constructor options for {@link SquadUpdateService}. */
export interface SquadUpdateServiceOptions {
  detectionService?: SquadUpdateDetectionProvider;
  latestVersionProvider?: SquadLatestVersionProvider;
  logger?: LoggingService;
  now?: () => number;
}

/**
 * Detects available Squad CLI/project updates (FR-005) without executing any
 * upgrade. Follow-up flows reuse the returned contract to run confirmed
 * `squad upgrade --self` (#246) or backed-up `squad upgrade` (#247).
 */
export class SquadUpdateService {
  private readonly _detectionService: SquadUpdateDetectionProvider;
  private readonly _latestVersionProvider: SquadLatestVersionProvider;
  private readonly _logger: LoggingService;
  private readonly _now: () => number;

  constructor(options: SquadUpdateServiceOptions = {}) {
    this._detectionService = options.detectionService ?? new SquadDetectionService();
    this._latestVersionProvider = options.latestVersionProvider ?? new NpmSquadLatestVersionProvider();
    this._logger = options.logger ?? LoggingService.getInstance();
    this._now = options.now ?? Date.now;
  }

  public async checkUpdates(workspaceRoot?: vscode.Uri): Promise<SquadResult<SquadUpdatesResult>> {
    const [latestCli, latestProject] = await Promise.all([
      this._latestVersionProvider.getLatestCliVersion(),
      this._latestVersionProvider.getLatestProjectVersion(),
    ]);

    if (!latestCli.ok) {
      return latestCli;
    }
    if (!latestProject.ok) {
      return latestProject;
    }

    const detection = await this._detectionService.detect(workspaceRoot);
    if (!detection.ok) {
      return detection;
    }

    const enrichedDetection = this._enrichDetection(detection.value, latestCli.value, latestProject.value);

    const result: SquadUpdatesResult = {
      detection: enrichedDetection,
      cli: this._buildCliCandidate(enrichedDetection, latestCli.value),
      project: this._buildProjectCandidate(enrichedDetection, latestProject.value),
      checkedAt: this._now(),
    };

    if (result.cli.updateAvailable || result.project.updateAvailable) {
      this._logger.info("Squad updates are available.");
    }

    return squadOk(result);
  }

  private _enrichDetection(
    detection: SquadDetectionResult,
    latestCliVersion: string,
    latestProjectVersion: string
  ): SquadDetectionResult {
    return {
      ...detection,
      cli: {
        ...detection.cli,
        versionStatus: this._resolveVersionStatus(detection.cli.cliVersion, latestCliVersion),
      },
      project: {
        ...detection.project,
        versionStatus: this._resolveVersionStatus(detection.project.projectVersion, latestProjectVersion),
      },
    };
  }

  private _buildCliCandidate(detection: SquadDetectionResult, latestVersion: string): SquadUpdateCandidate {
    const status = detection.cli.installed ? detection.cli.versionStatus : SquadVersionStatus.Unknown;
    return {
      target: SquadUpdateTarget.Cli,
      currentVersion: detection.cli.cliVersion,
      latestVersion,
      status,
      updateAvailable: status === SquadVersionStatus.UpdateAvailable,
      upgradeCommand: SquadUpgradeCommand.CliSelf,
      requiresConfirmation: true,
      requiresBackup: false,
      message: this._candidateMessage(SquadUpdateTarget.Cli, status, detection.cli.cliVersion, latestVersion),
    };
  }

  private _buildProjectCandidate(detection: SquadDetectionResult, latestVersion: string): SquadUpdateCandidate {
    const status = detection.project.versionStatus;
    return {
      target: SquadUpdateTarget.Project,
      currentVersion: detection.project.projectVersion,
      latestVersion,
      status,
      updateAvailable: status === SquadVersionStatus.UpdateAvailable,
      upgradeCommand: SquadUpgradeCommand.Project,
      requiresConfirmation: true,
      requiresBackup: true,
      message: this._candidateMessage(SquadUpdateTarget.Project, status, detection.project.projectVersion, latestVersion),
    };
  }

  private _candidateMessage(
    target: SquadUpdateTarget,
    status: SquadVersionStatus,
    currentVersion: string | null,
    latestVersion: string
  ): string {
    const label = target === SquadUpdateTarget.Cli ? "Squad CLI" : "Squad project";
    if (status === SquadVersionStatus.UpdateAvailable) {
      return `${label} update available: ${currentVersion} -> ${latestVersion}.`;
    }
    if (status === SquadVersionStatus.UpToDate) {
      return `${label} is up to date (${currentVersion}).`;
    }
    return `${label} update status is unknown.`;
  }

  private _resolveVersionStatus(current: string | null, latest: string | null): SquadVersionStatus {
    if (!current || !latest || !isComparableVersion(current) || !isComparableVersion(latest)) {
      return SquadVersionStatus.Unknown;
    }
    return compareVersions(current, latest) < 0 ? SquadVersionStatus.UpdateAvailable : SquadVersionStatus.UpToDate;
  }
}

function isComparableVersion(value: string): boolean {
  if (value === SQUAD_SOURCE_VERSION) {
    return false;
  }
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z-.]+)?$/.test(value);
}

function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => !Number.isNaN(part));

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}
