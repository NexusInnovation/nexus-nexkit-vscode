/**
 * SquadCliService (SQD-005) — a safe, allowlisted wrapper over the Squad CLI
 * (`@bradygaster/squad-cli`).
 *
 * Covers PRD FR-003 (non-interactive, timed-out CLI detection via
 * `squad version`), FR-004 (invocation resolution: global install, `npx`
 * fallback, or a custom path) and FR-005 (confirmed `squad upgrade` /
 * `squad upgrade --self`).
 *
 * Design guarantees:
 * - **Explicit allowlist.** Only the commands in {@link SQUAD_CLI_COMMAND_SPECS}
 *   may run, and each caller-supplied argument is validated against the
 *   command's allowed flags / operand policy before anything is spawned.
 * - **No shell injection.** Execution is delegated to an injectable
 *   {@link SquadProcessRunner} that spawns with `shell: false` and an args
 *   array (see {@link ChildProcessSquadRunner}).
 * - **Per-command timeouts + cancellation.** Every command has a default
 *   timeout; callers may override it and pass a `vscode.CancellationToken`.
 * - **Actionable, never-silent failures.** All outcomes are returned as
 *   {@link SquadResult}; missing CLI, timeout, cancellation, disallowed
 *   arguments and non-zero exits each map to a distinct {@link SquadError}.
 * - **Telemetry-safe.** No user paths, cwd, or captured output are logged to
 *   telemetry; only the command id and exit code are recorded for diagnostics.
 */

import type * as vscode from "vscode";
import { SettingsManager } from "../../../core/settingsManager";
import { LoggingService } from "../../../shared/services/loggingService";
import { SquadCliSource, squadErr, squadOk, type SquadDoctorReport, type SquadResult } from "../models";
import { ChildProcessSquadRunner, type SquadProcessRunner } from "./squadProcessRunner";
import { parseSquadDoctorReport } from "./squadDoctorParser";

/** npm package that provides the `squad` executable (FR-004). */
export const SQUAD_CLI_NPX_PACKAGE = "@bradygaster/squad-cli";

/** Executable name for a globally-installed Squad CLI (FR-004). */
export const SQUAD_CLI_GLOBAL_EXECUTABLE = "squad";

/** Per-command default timeouts in milliseconds. */
export const SQUAD_CLI_TIMEOUTS_MS = {
  /** Version probe — short, non-interactive (FR-003). */
  version: 15_000,
  /** Diagnostics. */
  doctor: 60_000,
  /** Project initialization. */
  init: 120_000,
  /** Project / CLI upgrade (FR-005). */
  upgrade: 120_000,
  /** Upstream, plugin, export/import operations. */
  standard: 60_000,
} as const;

/** Identifiers for the commands this service is allowed to run. */
export const SquadCliCommand = {
  Version: "version",
  Doctor: "doctor",
  Init: "init",
  Upgrade: "upgrade",
  UpgradeSelf: "upgrade-self",
  Upstream: "upstream",
  Plugin: "plugin",
  Export: "export",
  Import: "import",
} as const;

export type SquadCliCommand = (typeof SquadCliCommand)[keyof typeof SquadCliCommand];

/** Allowlist entry describing how a single command may be invoked. */
interface SquadCliCommandSpec {
  /** Fixed leading argument vector prepended to caller arguments. */
  readonly argv: readonly string[];

  /** Flags a caller may append (exact match, long or short form). */
  readonly allowedFlags: readonly string[];

  /** Whether non-flag positional operands may be appended. */
  readonly allowsOperands: boolean;

  /** Default timeout in milliseconds for this command. */
  readonly defaultTimeoutMs: number;
}

/**
 * The command allowlist. Anything not present here cannot be executed, and
 * arguments outside a command's declared policy are rejected before spawning.
 */
export const SQUAD_CLI_COMMAND_SPECS: Readonly<Record<SquadCliCommand, SquadCliCommandSpec>> = {
  [SquadCliCommand.Version]: {
    argv: ["version"],
    allowedFlags: [],
    allowsOperands: false,
    defaultTimeoutMs: SQUAD_CLI_TIMEOUTS_MS.version,
  },
  [SquadCliCommand.Doctor]: {
    argv: ["doctor"],
    allowedFlags: ["--json"],
    allowsOperands: false,
    defaultTimeoutMs: SQUAD_CLI_TIMEOUTS_MS.doctor,
  },
  [SquadCliCommand.Init]: {
    argv: ["init"],
    allowedFlags: ["--yes", "--force", "--preset"],
    allowsOperands: true,
    defaultTimeoutMs: SQUAD_CLI_TIMEOUTS_MS.init,
  },
  [SquadCliCommand.Upgrade]: {
    argv: ["upgrade"],
    allowedFlags: ["--yes"],
    allowsOperands: false,
    defaultTimeoutMs: SQUAD_CLI_TIMEOUTS_MS.upgrade,
  },
  [SquadCliCommand.UpgradeSelf]: {
    argv: ["upgrade", "--self"],
    allowedFlags: ["--yes"],
    allowsOperands: false,
    defaultTimeoutMs: SQUAD_CLI_TIMEOUTS_MS.upgrade,
  },
  [SquadCliCommand.Upstream]: {
    argv: ["upstream"],
    allowedFlags: ["--yes"],
    allowsOperands: true,
    defaultTimeoutMs: SQUAD_CLI_TIMEOUTS_MS.standard,
  },
  [SquadCliCommand.Plugin]: {
    argv: ["plugin"],
    allowedFlags: ["--yes", "--json"],
    allowsOperands: true,
    defaultTimeoutMs: SQUAD_CLI_TIMEOUTS_MS.standard,
  },
  [SquadCliCommand.Export]: {
    argv: ["export"],
    allowedFlags: ["--output", "--ref", "--path"],
    allowsOperands: true,
    defaultTimeoutMs: SQUAD_CLI_TIMEOUTS_MS.standard,
  },
  [SquadCliCommand.Import]: {
    argv: ["import"],
    allowedFlags: ["--yes"],
    allowsOperands: true,
    defaultTimeoutMs: SQUAD_CLI_TIMEOUTS_MS.standard,
  },
};

/** Options for a single {@link SquadCliService.execute} call. */
export interface SquadCliExecuteOptions {
  /** Extra arguments appended after the command's fixed argv (validated). */
  args?: string[];

  /** Working directory for the process (typically the workspace root). */
  cwd?: vscode.Uri;

  /** Timeout override in milliseconds; defaults to the command's timeout. */
  timeoutMs?: number;

  /** Cancellation token; cancelling kills the process and yields `cancelled`. */
  token?: vscode.CancellationToken;

  /**
   * Override for the CLI source to resolve for this single call (FR-004).
   * When omitted, the source configured on the service / settings is used.
   * Lets callers (e.g. detection) probe a specific location without mutating
   * the shared service configuration.
   */
  source?: SquadCliSource;
}

/** Successful execution details returned on a zero exit code. */
export interface SquadCliExecution {
  /** The command that was executed. */
  command: SquadCliCommand;

  /** Process exit code (always `0` on success). */
  exitCode: number;

  /** Captured standard output. */
  stdout: string;

  /** Captured standard error (may contain warnings even on success). */
  stderr: string;

  /** Wall-clock duration of the invocation in milliseconds. */
  durationMs: number;
}

/** Constructor options; all seams are injectable for unit testing. */
export interface SquadCliServiceOptions {
  /** Process runner seam. Defaults to {@link ChildProcessSquadRunner}. */
  runner?: SquadProcessRunner;

  /** Logger. Defaults to the shared {@link LoggingService} singleton. */
  logger?: LoggingService;

  /**
   * Override for the configured CLI source. When omitted, resolved from
   * {@link SettingsManager.getSquadCliSource} at execution time (FR-004).
   */
  cliSource?: SquadCliSource;

  /**
   * Override for the custom CLI path. When omitted, resolved from
   * {@link SettingsManager.getSquadCliPath} at execution time (FR-004).
   */
  customCliPath?: string;

  /** Clock seam for measuring durations; defaults to {@link Date.now}. */
  now?: () => number;
}

/** Resolved invocation target for the configured CLI source. */
interface ResolvedInvocation {
  /** Executable to spawn. */
  command: string;

  /** Leading arguments before the command argv (e.g. the npx package). */
  prefixArgs: string[];

  /** The source that produced this invocation, for remediation messaging. */
  source: SquadCliSource;
}

/**
 * Safe, allowlisted wrapper over the Squad CLI. See the module doc comment for
 * the full set of guarantees.
 */
export class SquadCliService {
  private readonly _runner: SquadProcessRunner;
  private readonly _logger: LoggingService;
  private readonly _cliSourceOverride?: SquadCliSource;
  private readonly _customCliPathOverride?: string;
  private readonly _now: () => number;

  constructor(options: SquadCliServiceOptions = {}) {
    this._runner = options.runner ?? new ChildProcessSquadRunner();
    this._logger = options.logger ?? LoggingService.getInstance();
    this._cliSourceOverride = options.cliSource;
    this._customCliPathOverride = options.customCliPath;
    this._now = options.now ?? Date.now;
  }

  /**
   * Execute an allowlisted Squad command. Returns a {@link SquadResult} whose
   * failure branch carries an actionable {@link SquadError}; success is only
   * reported for a zero exit code.
   */
  public async execute(
    command: SquadCliCommand,
    options: SquadCliExecuteOptions = {}
  ): Promise<SquadResult<SquadCliExecution>> {
    const spec = SQUAD_CLI_COMMAND_SPECS[command];
    if (!spec) {
      return squadErr({
        code: "cli-execution-failed",
        message: `Unknown Squad command: ${String(command)}.`,
        remediation: "Use one of the supported Squad commands.",
      });
    }

    const extraArgs = options.args ?? [];
    const argValidation = this._validateArgs(spec, extraArgs);
    if (!argValidation.ok) {
      return argValidation;
    }

    const invocation = this._resolveInvocation(options.source);
    if (!invocation.ok) {
      return invocation;
    }

    if (options.token?.isCancellationRequested) {
      return squadErr(this._cancelledError());
    }

    const { command: exe, prefixArgs, source } = invocation.value;
    const fullArgs = [...prefixArgs, ...spec.argv, ...extraArgs];
    const timeoutMs = options.timeoutMs ?? spec.defaultTimeoutMs;
    const startedAt = this._now();

    this._logger.debug(`Squad CLI: running "${command}" (source=${source}, timeout=${timeoutMs}ms)`);

    let result;
    try {
      result = await this._runner.run({
        command: exe,
        args: fullArgs,
        cwd: options.cwd?.fsPath,
        timeoutMs,
        token: options.token,
      });
    } catch (error) {
      this._logger.error(`Squad CLI: unexpected failure running "${command}"`, error);
      return squadErr({
        code: "cli-execution-failed",
        message: `The Squad "${command}" command failed to run.`,
        remediation: "Check the Nexkit output channel for details and try again.",
        cause: error,
      });
    }

    const durationMs = this._now() - startedAt;

    if (result.cancelled) {
      this._logger.debug(`Squad CLI: "${command}" cancelled after ${durationMs}ms`);
      return squadErr(this._cancelledError());
    }

    if (result.spawnErrorCode) {
      return squadErr(this._notFoundError(source, result.spawnErrorCode));
    }

    if (result.timedOut) {
      this._logger.warn(`Squad CLI: "${command}" timed out after ${timeoutMs}ms`);
      return squadErr({
        code: "cli-timeout",
        message: `The Squad "${command}" command timed out.`,
        remediation: "The operation took too long. Verify Squad is responsive and retry.",
        detail: `timeoutMs=${timeoutMs}`,
      });
    }

    if (result.exitCode !== 0) {
      const summary = this._summarizeStderr(result.stderr);
      this._logger.warn(`Squad CLI: "${command}" exited with code ${result.exitCode ?? "null"}`);
      return squadErr({
        code: "cli-execution-failed",
        message: `The Squad "${command}" command failed${summary ? `: ${summary}` : "."}`,
        remediation: "Review the command output, then resolve the reported issue and retry.",
        detail: `exitCode=${result.exitCode ?? "null"}`,
      });
    }

    this._logger.debug(`Squad CLI: "${command}" succeeded in ${durationMs}ms`);
    return squadOk({
      command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
    });
  }

  /**
   * Probe the CLI version and resolved source (FR-003, FR-004). Runs
   * `squad version` non-interactively and parses the first semver token from
   * stdout/stderr. Returns `version-unknown` when the CLI ran but no version
   * could be parsed.
   *
   * Pass {@link SquadCliExecuteOptions.source} to probe a specific location
   * (global / npx / custom) without mutating the shared service configuration —
   * used by {@link import("./squadDetectionService").SquadDetectionService} to
   * look across every possible install location on Windows and Linux.
   */
  public async probeCli(
    options: SquadCliExecuteOptions = {}
  ): Promise<SquadResult<{ version: string; source: SquadCliSource }>> {
    const result = await this.execute(SquadCliCommand.Version, options);
    if (!result.ok) {
      return result;
    }

    const version = this._parseVersion(`${result.value.stdout}\n${result.value.stderr}`);
    if (!version) {
      return squadErr({
        code: "version-unknown",
        message: "The Squad CLI version could not be determined.",
        remediation: "Ensure the installed Squad CLI supports the `version` command.",
      });
    }

    const resolved = this._resolveInvocation(options.source);
    const source = resolved.ok ? resolved.value.source : options.source ?? SquadCliSource.Npx;
    return squadOk({ version, source });
  }

  /**
   * Probe the CLI version (FR-003). Thin wrapper over {@link probeCli} that
   * collapses the result to the version string.
   */
  public async getCliVersion(options: SquadCliExecuteOptions = {}): Promise<SquadResult<string>> {
    const result = await this.probeCli(options);
    if (!result.ok) {
      return result;
    }
    return squadOk(result.value.version);
  }

  /**
   * Whether a usable Squad CLI is available (FR-003). Convenience wrapper over
   * {@link getCliVersion} that collapses the result to a boolean.
   */
  public async isCliAvailable(options: SquadCliExecuteOptions = {}): Promise<boolean> {
    const result = await this.getCliVersion(options);
    return result.ok;
  }

  /**
   * Run Squad Doctor diagnostics (SQD-021, FR-060). Executes the allowlisted
   * `doctor` command (requesting structured `--json` output) and parses the
   * result into a {@link SquadDoctorReport}.
   *
   * Failures stay visible and actionable: a missing CLI, timeout or
   * cancellation are surfaced unchanged, while a non-zero exit is re-mapped to
   * a doctor-scoped `doctor-failed` error so the UI shows relevant remediation.
   */
  public async runDoctor(
    options: SquadCliExecuteOptions = {}
  ): Promise<SquadResult<SquadDoctorReport>> {
    const result = await this.execute(SquadCliCommand.Doctor, {
      ...options,
      args: options.args ?? ["--json"],
    });

    if (!result.ok) {
      if (result.error.code === "cli-execution-failed") {
        return squadErr({
          code: "doctor-failed",
          message: "Squad Doctor reported a problem.",
          remediation:
            "Review the Squad Doctor output, resolve the reported issues, then run it again.",
          detail: result.error.detail,
          cause: result.error.cause,
        });
      }
      return result;
    }

    const report = parseSquadDoctorReport(result.value.stdout, result.value.stderr, this._now());
    return squadOk(report);
  }

  /** Validate caller-supplied arguments against the command's allowlist. */
  private _validateArgs(
    spec: SquadCliCommandSpec,
    args: string[]
  ): SquadResult<true> {
    for (const arg of args) {
      if (arg.includes("\0") || /[\r\n]/.test(arg)) {
        return squadErr({
          code: "cli-execution-failed",
          message: "A Squad command argument contains invalid control characters.",
          remediation: "Remove newline or null characters from the argument and retry.",
        });
      }

      const isFlag = arg.startsWith("-");
      if (isFlag) {
        const flagName = arg.split("=", 1)[0];
        if (!spec.allowedFlags.includes(flagName)) {
          return squadErr({
            code: "cli-execution-failed",
            message: `The argument "${flagName}" is not permitted for this Squad command.`,
            remediation: "Only allowlisted flags may be passed to the Squad CLI.",
          });
        }
      } else if (!spec.allowsOperands) {
        return squadErr({
          code: "cli-execution-failed",
          message: "This Squad command does not accept additional arguments.",
          remediation: "Remove the extra arguments and retry.",
        });
      }
    }

    return squadOk(true);
  }

  /** Resolve how the CLI should be invoked from the configured source (FR-004). */
  private _resolveInvocation(sourceOverride?: SquadCliSource): SquadResult<ResolvedInvocation> {
    const source = sourceOverride ?? this._cliSourceOverride ?? SettingsManager.getSquadCliSource();

    switch (source) {
      case SquadCliSource.Custom: {
        const customPath = (this._customCliPathOverride ?? SettingsManager.getSquadCliPath()).trim();
        if (!customPath) {
          return squadErr({
            code: "cli-not-found",
            message: "No custom Squad CLI path is configured.",
            remediation:
              "Set `nexkit.squad.cliPath`, or change `nexkit.squad.cliSource` to `npx` or `global`.",
          });
        }
        return squadOk({ command: customPath, prefixArgs: [], source });
      }

      case SquadCliSource.Global:
        return squadOk({ command: SQUAD_CLI_GLOBAL_EXECUTABLE, prefixArgs: [], source });

      case SquadCliSource.Npx:
      default:
        return squadOk({
          command: "npx",
          prefixArgs: ["--yes", SQUAD_CLI_NPX_PACKAGE],
          source: SquadCliSource.Npx,
        });
    }
  }

  /** Build a source-specific "CLI not found" error with actionable remediation. */
  private _notFoundError(source: SquadCliSource, spawnErrorCode: string): {
    code: "cli-not-found";
    message: string;
    remediation: string;
    detail: string;
  } {
    let remediation: string;
    switch (source) {
      case SquadCliSource.Global:
        remediation = `Install it with \`npm install -g ${SQUAD_CLI_NPX_PACKAGE}@latest\`, or switch \`nexkit.squad.cliSource\` to \`npx\`.`;
        break;
      case SquadCliSource.Custom:
        remediation =
          "Verify `nexkit.squad.cliPath` points to a valid Squad executable, or switch to `npx` or `global`.";
        break;
      case SquadCliSource.Npx:
      default:
        remediation = "Ensure Node.js and `npx` are installed and available on your PATH.";
        break;
    }

    return {
      code: "cli-not-found",
      message: "The Squad CLI could not be found.",
      remediation,
      detail: `source=${source} code=${spawnErrorCode}`,
    };
  }

  /** Shared cancellation error. */
  private _cancelledError(): { code: "cancelled"; message: string; remediation: string } {
    return {
      code: "cancelled",
      message: "The Squad command was cancelled.",
      remediation: "Run the command again if you still need it.",
    };
  }

  /** Extract the first single-line summary from stderr for user messaging. */
  private _summarizeStderr(stderr: string): string {
    const line = stderr
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!line) {
      return "";
    }
    return line.length > 200 ? `${line.slice(0, 197)}...` : line;
  }

  /** Parse the first semantic-version token from CLI output. */
  private _parseVersion(output: string): string | null {
    const match = output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z-.]+)?/);
    return match ? match[0] : null;
  }
}
