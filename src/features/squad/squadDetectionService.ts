import * as vscode from "vscode";
import { execFile } from "child_process";
import { LoggingService } from "../../shared/services/loggingService";
import {
  SQUAD_MARKER_FILES,
  SquadCliInfo,
  SquadCliSource,
  SquadDetectionResult,
  SquadInstallState,
  SquadMarkerPresence,
  SquadProjectInfo,
  SquadVersionStatus,
  SquadResult,
  squadErr,
  squadOk,
} from "./models";

/**
 * Marker file that carries the project Squad version comment (FR-002).
 */
const SQUAD_AGENT_MARKER = ".github/agents/squad.agent.md";

/**
 * Matches the `<!-- version: x -->` comment used to declare the project Squad
 * version (FR-002).
 */
const VERSION_COMMENT_PATTERN = /<!--\s*version:\s*([^\s>]+)\s*-->/i;

/**
 * Matches a semver-like version token in arbitrary CLI output (FR-003).
 */
const CLI_VERSION_PATTERN = /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/;

/** Default timeout for the non-interactive `squad version` call (FR-003). */
const DEFAULT_CLI_TIMEOUT_MS = 5000;

/** Abstraction over reading workspace files, injectable for tests. */
export interface SquadFileReader {
  /** Whether a file exists at the given URI. */
  exists(uri: vscode.Uri): Promise<boolean>;

  /** Read a file as UTF-8 text. */
  readFile(uri: vscode.Uri): Promise<string>;
}

/** Outcome of a single Squad CLI invocation. */
export interface SquadCliRunResult {
  /** Whether the executable was found and could be launched. */
  found: boolean;

  /** Captured stdout (or stderr fallback), when the process ran. */
  stdout: string;

  /** Whether the process was killed after exceeding the timeout. */
  timedOut: boolean;
}

/** Runs the Squad CLI non-interactively, injectable for tests. */
export type SquadCliRunner = (command: string, args: string[], timeoutMs: number) => Promise<SquadCliRunResult>;

/** Constructor options for {@link SquadDetectionService}. */
export interface SquadDetectionServiceOptions {
  /** File reader; defaults to a `vscode.workspace.fs`-backed reader. */
  fileReader?: SquadFileReader;

  /** CLI runner; defaults to an `execFile`-backed runner. */
  cliRunner?: SquadCliRunner;

  /** Logging service; defaults to the shared singleton. */
  logger?: LoggingService;

  /** Clock for `detectedAt`; defaults to `Date.now`. */
  now?: () => number;

  /**
   * Custom CLI executable path (FR-004). When provided, it is invoked instead
   * of the global `squad` command and the resolved source is reported as
   * {@link SquadCliSource.Custom}.
   */
  customCliPath?: string;

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
  private readonly _cliRunner: SquadCliRunner;
  private readonly _logger: LoggingService;
  private readonly _now: () => number;
  private readonly _customCliPath?: string;
  private readonly _cliTimeoutMs: number;
  private readonly _latestProjectVersion: string | null;
  private readonly _latestCliVersion: string | null;

  constructor(options: SquadDetectionServiceOptions = {}) {
    this._fileReader = options.fileReader ?? createDefaultFileReader();
    this._cliRunner = options.cliRunner ?? defaultCliRunner;
    this._logger = options.logger ?? LoggingService.getInstance();
    this._now = options.now ?? (() => Date.now());
    this._customCliPath = options.customCliPath;
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
    const projectVersion = markers[SQUAD_AGENT_MARKER]
      ? await this._readProjectVersion(joinRelative(root, SQUAD_AGENT_MARKER))
      : null;
    const versionStatus = this._resolveVersionStatus(projectVersion, this._latestProjectVersion);

    return { installState, markers, projectVersion, versionStatus };
  }

  /**
   * Detect Squad CLI availability via a non-interactive, timed-out call
   * (FR-003). Absence is a valid state — never a thrown error.
   */
  private async _detectCli(): Promise<SquadCliInfo> {
    const command = this._customCliPath ?? "squad";
    const source: SquadCliSource = this._customCliPath ? SquadCliSource.Custom : SquadCliSource.Global;

    for (const args of [["version"], ["--version"]]) {
      let run: SquadCliRunResult;
      try {
        run = await this._cliRunner(command, args, this._cliTimeoutMs);
      } catch (error) {
        this._logger.warn(`Squad CLI invocation failed for "${command} ${args.join(" ")}"`, error);
        continue;
      }

      if (!run.found) {
        break;
      }

      if (run.timedOut) {
        this._logger.warn(`Squad CLI call "${command} ${args.join(" ")}" timed out.`);
        continue;
      }

      const cliVersion = parseCliVersion(run.stdout);
      if (cliVersion) {
        return {
          installed: true,
          source,
          cliVersion,
          versionStatus: this._resolveVersionStatus(cliVersion, this._latestCliVersion),
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
   * Read and parse the `<!-- version: x -->` comment (FR-002).
   * Returns `null` when the file cannot be read or the comment is absent.
   */
  private async _readProjectVersion(uri: vscode.Uri): Promise<string | null> {
    try {
      const content = await this._fileReader.readFile(uri);
      const match = VERSION_COMMENT_PATTERN.exec(content);
      return match ? match[1] : null;
    } catch (error) {
      this._logger.warn("Failed to read Squad project version comment.", error);
      return null;
    }
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

/** Extract a semver-like token from CLI output, or `null`. */
function parseCliVersion(output: string): string | null {
  const match = CLI_VERSION_PATTERN.exec(output);
  return match ? match[1] : null;
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

/** Default `execFile`-backed CLI runner with a hard timeout (FR-003). */
const defaultCliRunner: SquadCliRunner = (command, args, timeoutMs) =>
  new Promise<SquadCliRunResult>((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: NodeJS.Signals };
        if (err.code === "ENOENT") {
          resolve({ found: false, stdout: "", timedOut: false });
          return;
        }
        if (err.killed || err.signal === "SIGTERM") {
          resolve({ found: true, stdout: stdout ?? "", timedOut: true });
          return;
        }
        resolve({ found: true, stdout: stdout || stderr || "", timedOut: false });
        return;
      }
      resolve({ found: true, stdout: stdout ?? "", timedOut: false });
    });
  });
