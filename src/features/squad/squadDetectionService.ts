import * as vscode from "vscode";
import { LoggingService } from "../../shared/services/loggingService";
import {
  SQUAD_MARKER_FILES,
  SQUAD_SOURCE_VERSION,
  SquadCliInfo,
  SquadCliSource,
  SquadDetectionResult,
  SquadInstallState,
  SquadMarkerPresence,
  SquadProjectInfo,
  SquadProjectVersion,
  SquadVersionStatus,
  SquadResult,
  squadErr,
  squadOk,
} from "./models";
import { SquadCliService } from "./squadCliService";
import { SQUAD_AGENT_MARKER, parseSquadProjectVersion } from "./squadProjectVersionReader";

/** Default timeout for the non-interactive `squad version` call (FR-003). */
const DEFAULT_CLI_TIMEOUT_MS = 5000;

/**
 * Order in which the CLI is probed across local install locations (FR-003,
 * FR-004). A configured custom path wins, otherwise a global install is the
 * common case. Cross-platform executable resolution (Windows `.cmd`/`.ps1`
 * shims, POSIX `PATH`) is handled by the underlying process runner used by
 * {@link SquadCliService}.
 *
 * `npx` is intentionally excluded: it is a download-on-demand *runner*, not an
 * install location. Probing it would run `npx --yes …`, which fetches the
 * package over the network (slow on every panel refresh) and can leave a
 * process tree that hangs detection on Windows — freezing the panel. `npx`
 * remains available for explicit user-initiated CLI commands, where a spinner
 * and longer timeout are appropriate.
 */
const CLI_PROBE_SOURCES: readonly SquadCliSource[] = [SquadCliSource.Custom, SquadCliSource.Global];

/** Abstraction over reading workspace files, injectable for tests. */
export interface SquadFileReader {
  /** Whether a file exists at the given URI. */
  exists(uri: vscode.Uri): Promise<boolean>;

  /** Read a file as UTF-8 text. */
  readFile(uri: vscode.Uri): Promise<string>;
}

/**
 * Minimal CLI-probe seam consumed by detection. Backed in production by
 * {@link SquadCliService}, which spawns the CLI through a cross-platform,
 * shell-safe process runner. Injectable so unit tests need not spawn processes.
 */
export interface SquadCliProbe {
  /**
   * Probe the CLI for a given source, returning the parsed version and the
   * resolved source, or an actionable error (e.g. `cli-not-found`).
   */
  probeCli(options?: {
    timeoutMs?: number;
    source?: SquadCliSource;
    token?: vscode.CancellationToken;
  }): Promise<SquadResult<{ version: string; source: SquadCliSource }>>;
}

/** Constructor options for {@link SquadDetectionService}. */
export interface SquadDetectionServiceOptions {
  /** File reader; defaults to a `vscode.workspace.fs`-backed reader. */
  fileReader?: SquadFileReader;

  /**
   * CLI probe seam; defaults to a shared {@link SquadCliService}. Detection
   * delegates all executable resolution to it so a globally-installed CLI is
   * found across platforms (e.g. an npm `squad.cmd`/`squad.ps1` shim on
   * Windows), respecting the configured `nexkit.squad.cliSource`/`cliPath`.
   */
  cliService?: SquadCliProbe;

  /** Logging service; defaults to the shared singleton. */
  logger?: LoggingService;

  /** Clock for `detectedAt`; defaults to `Date.now`. */
  now?: () => number;

  /** CLI call timeout in milliseconds (FR-003). */
  cliTimeoutMs?: number;

  /**
   * Latest known project version used to compute {@link SquadVersionStatus}.
   * When absent, the project version status stays `unknown` (FR-002).
   */
  latestProjectVersion?: string | null;

  /**
   * Latest known CLI version used to compute {@link SquadVersionStatus}.
   * When absent, the CLI version status stays `unknown`.
   */
  latestCliVersion?: string | null;
}

/**
 * Detects whether Squad is present in a workspace and, when possible, which
 * versions are installed (PRD FR-001, FR-002, FR-003).
 *
 * The service performs no work during extension activation — callers invoke
 * {@link detect} on demand (e.g. when the Squad panel opens). Every fallible
 * step returns a {@link SquadResult}; CLI absence is a valid detected state,
 * not a failure.
 */
export class SquadDetectionService {
  private readonly _fileReader: SquadFileReader;
  private readonly _cliService: SquadCliProbe;
  private readonly _logger: LoggingService;
  private readonly _now: () => number;
  private readonly _cliTimeoutMs: number;
  private readonly _latestProjectVersion: string | null;
  private readonly _latestCliVersion: string | null;

  constructor(options: SquadDetectionServiceOptions = {}) {
    this._fileReader = options.fileReader ?? createDefaultFileReader();
    this._cliService = options.cliService ?? new SquadCliService();
    this._logger = options.logger ?? LoggingService.getInstance();
    this._now = options.now ?? (() => Date.now());
    this._cliTimeoutMs = options.cliTimeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;
    this._latestProjectVersion = options.latestProjectVersion ?? null;
    this._latestCliVersion = options.latestCliVersion ?? null;
  }

  /**
   * Produce a combined project + CLI detection snapshot.
   *
   * @param workspaceRoot Workspace root to inspect. Defaults to the first
   * workspace folder when omitted.
   */
  public async detect(workspaceRoot?: vscode.Uri): Promise<SquadResult<SquadDetectionResult>> {
    const root = workspaceRoot ?? this._resolveWorkspaceRoot();
    if (!root) {
      return squadErr({
        code: "not-a-workspace",
        message: "No workspace folder is open, so Squad detection cannot run.",
        remediation: "Open a folder or workspace and try again.",
      });
    }

    try {
      const project = await this._detectProject(root);
      const cli = await this._detectCli();
      return squadOk({
        project,
        cli,
        detectedAt: this._now(),
      });
    } catch (error) {
      this._logger.error("Squad detection failed", error);
      return squadErr({
        code: "detection-failed",
        message: "Failed to determine whether Squad is installed in this workspace.",
        remediation: "Check the Nexkit output channel for details, then try again.",
        detail: error instanceof Error ? error.message : undefined,
        cause: error,
      });
    }
  }

  /**
   * Detect Squad project state from workspace files only (FR-001, FR-002).
   */
  private async _detectProject(root: vscode.Uri): Promise<SquadProjectInfo> {
    const markers = {} as SquadMarkerPresence;
    for (const marker of SQUAD_MARKER_FILES) {
      markers[marker] = await this._fileReader.exists(joinRelative(root, marker));
    }

    const installState = this._deriveInstallState(markers);
    const parsedVersion = markers[SQUAD_AGENT_MARKER]
      ? await this._readProjectVersion(joinRelative(root, SQUAD_AGENT_MARKER))
      : null;

    const projectVersion = parsedVersion?.isSource
      ? SQUAD_SOURCE_VERSION
      : (parsedVersion?.version ?? null);

    // Only a pinned semver is comparable; source builds and missing/malformed
    // stamps stay `unknown` (FR-002).
    const comparableVersion = parsedVersion && !parsedVersion.isSource ? parsedVersion.version : null;
    const versionStatus = this._resolveVersionStatus(comparableVersion, this._latestProjectVersion);

    return { installState, markers, projectVersion, versionStatus };
  }

  /**
   * Detect Squad CLI availability by probing local install locations
   * (custom `cliPath`, then the global PATH) across platforms (FR-003, FR-004).
   * Resolution and shell-safe spawning are delegated to {@link SquadCliService},
   * so npm shims (`squad.cmd`/`squad.ps1` on Windows) and `PATH`-resolved
   * binaries on Linux are all found. The `npx` source is intentionally excluded
   * from passive detection: it downloads on demand and can hang, which would
   * block the panel at startup. Absence is a valid state — never a thrown error.
   */
  private async _detectCli(): Promise<SquadCliInfo> {
    for (const source of CLI_PROBE_SOURCES) {
      let probe: SquadResult<{ version: string; source: SquadCliSource }>;
      try {
        probe = await this._probeWithGuard(source);
      } catch (error) {
        this._logger.warn(`Squad CLI probe threw for source "${source}".`, error);
        continue;
      }

      if (probe.ok) {
        return {
          installed: true,
          source: probe.value.source,
          cliVersion: probe.value.version,
          versionStatus: this._resolveVersionStatus(probe.value.version, this._latestCliVersion),
        };
      }
    }

    return {
      installed: false,
      cliVersion: null,
      versionStatus: SquadVersionStatus.Unknown,
    };
  }

  /**
   * Probe a single source with a hard wall-clock guard. The process runner has
   * its own timeout, but a spawned CLI could in theory fail to terminate (e.g.
   * a child holding an inherited pipe on Windows). This guard guarantees
   * detection — and therefore the panel — never blocks: if a probe overruns its
   * budget it is abandoned and reported as `cli-not-found`.
   */
  private async _probeWithGuard(
    source: SquadCliSource,
  ): Promise<SquadResult<{ version: string; source: SquadCliSource }>> {
    const guardMs = this._cliTimeoutMs + 2000;
    let timer: NodeJS.Timeout | undefined;
    const guard = new Promise<SquadResult<{ version: string; source: SquadCliSource }>>((resolve) => {
      timer = setTimeout(() => {
        this._logger.warn(`Squad CLI probe for source "${source}" exceeded ${guardMs}ms; treating as not found.`);
        resolve(
          squadErr({
            code: "cli-not-found",
            message: "The Squad CLI probe did not complete in time.",
            remediation: "Verify the Squad CLI is installed and responsive, then retry.",
          }),
        );
      }, guardMs);
      timer.unref?.();
    });

    try {
      return await Promise.race([this._cliService.probeCli({ timeoutMs: this._cliTimeoutMs, source }), guard]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Read and parse the `<!-- version: x -->` stamp via the shared parser
   * (FR-002, SQD-006). Returns `null` when the file cannot be read or the
   * stamp is malformed — detection degrades to `unknown` rather than failing,
   * while direct callers use {@link SquadProjectVersionReader} for actionable
   * errors.
   */
  private async _readProjectVersion(uri: vscode.Uri): Promise<SquadProjectVersion | null> {
    let content: string;
    try {
      content = await this._fileReader.readFile(uri);
    } catch (error) {
      this._logger.warn("Failed to read Squad project version comment.", error);
      return null;
    }

    const parsed = parseSquadProjectVersion(content);
    if (!parsed.ok) {
      this._logger.warn(
        `Squad project version stamp could not be parsed: ${parsed.error.detail ?? parsed.error.message}`,
      );
      return null;
    }
    return parsed.value;
  }

  /** Derive the aggregate install state from marker presence (FR-001). */
  private _deriveInstallState(markers: SquadMarkerPresence): SquadInstallState {
    const present = SQUAD_MARKER_FILES.filter((marker) => markers[marker]).length;
    if (present === 0) {
      return SquadInstallState.NotInstalled;
    }
    if (present === SQUAD_MARKER_FILES.length) {
      return SquadInstallState.Installed;
    }
    return SquadInstallState.Partial;
  }

  /**
   * Compute a version status against a latest known version. `unknown` is a
   * first-class state (FR-002) — used whenever either version is missing.
   */
  private _resolveVersionStatus(current: string | null, latest: string | null): SquadVersionStatus {
    if (!current || !latest) {
      return SquadVersionStatus.Unknown;
    }
    const comparison = compareVersions(current, latest);
    if (comparison === null) {
      return SquadVersionStatus.Unknown;
    }
    return comparison < 0 ? SquadVersionStatus.UpdateAvailable : SquadVersionStatus.UpToDate;
  }

  /** Resolve the first workspace folder root, if any. */
  private _resolveWorkspaceRoot(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }
}

/** Join a workspace-root-relative marker path cross-platform. */
function joinRelative(root: vscode.Uri, relative: string): vscode.Uri {
  return vscode.Uri.joinPath(root, ...relative.split("/"));
}

/**
 * Compare two dotted numeric versions. Returns a negative number when `a` is
 * older, a positive number when newer, `0` when equal, or `null` when either
 * version has no numeric components to compare.
 */
function compareVersions(a: string, b: string): number | null {
  const parse = (value: string): number[] =>
    value
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => !Number.isNaN(part));

  const left = parse(a);
  const right = parse(b);
  if (left.length === 0 || right.length === 0) {
    return null;
  }

  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** Build the default `vscode.workspace.fs`-backed file reader. */
function createDefaultFileReader(): SquadFileReader {
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
