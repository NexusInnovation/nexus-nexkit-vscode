import * as vscode from "vscode";
import { NodeFileSystem } from "./nodeFileSystem";
import { parseValidationMarker, resolveScriptFileName, resolveScriptUri } from "./scriptResolver";
import {
  IClock,
  IFileSystem,
  IPrerequisiteLogger,
  IProcessRunner,
  PrerequisiteError,
  PrerequisiteStep,
  ScriptRunResult,
  StepExecution,
  systemClock,
} from "./types";

const KILL_GRACE_MS = 5_000;
const PROBE_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

/** Per-phase timeouts. Setup installs toolchains and legitimately runs long. */
export const STEP_TIMEOUTS_MS: Readonly<Record<PrerequisiteStep, number>> = {
  check: 60_000,
  validate: 5 * 60_000,
  setup: 30 * 60_000,
};

const POWERSHELL_CANDIDATES = ["pwsh", "powershell.exe"];

/**
 * Phases that must never prompt. Nexkit owns install consent, so the scripts are
 * forced non-interactive and can never reach a `Read-Host` / `Invoke-Expression`
 * install path of their own.
 */
const NON_INTERACTIVE_STEPS: ReadonlySet<PrerequisiteStep> = new Set<PrerequisiteStep>(["validate", "setup"]);

const EXECUTION_POLICY_PATTERN = /execution of scripts is disabled|UnauthorizedAccess|ExecutionPolicy/i;
const MISSING_INTERACTIVE_PARAM_PATTERN = /parameter cannot be found that matches parameter name ['"]?Interactive/i;

export interface RunStepOptions {
  step: PrerequisiteStep;
  scriptsRoot: vscode.Uri;
  workspaceRoot: vscode.Uri;
  platform: NodeJS.Platform;
  correlationId: string;
  cancellationToken?: vscode.CancellationToken;
}

/**
 * Executes and interprets a single prerequisite phase.
 *
 * Owns the mapping from raw process results to domain meaning; owns nothing of
 * the process mechanics, which live behind {@link IProcessRunner}.
 */
export class PrerequisiteRunnerService {
  private _powerShellCommand: string | undefined;
  private _jqVerified = false;

  public constructor(
    private readonly _processRunner: IProcessRunner,
    private readonly _logging: IPrerequisiteLogger,
    private readonly _fileSystem: IFileSystem = new NodeFileSystem(),
    private readonly _clock: IClock = systemClock
  ) {}

  /**
   * Verifies the interpreter stack before any script runs.
   *
   * `jq` is a hard requirement on Unix: the shell scripts parse `requirements.json`
   * with it, and failing fast with a remediation beats a confusing mid-run error.
   */
  public async ensureEnvironment(
    platform: NodeJS.Platform,
    cwd: string,
    cancellationToken?: vscode.CancellationToken
  ): Promise<void> {
    if (platform === "win32") {
      await this._resolvePowerShellCommand(cwd, cancellationToken);
      return;
    }

    await this._ensureJq(cwd, cancellationToken);
  }

  public async runStep(options: RunStepOptions): Promise<StepExecution> {
    const scriptFileName = resolveScriptFileName(options.step, options.platform);
    const scriptUri = resolveScriptUri(options.scriptsRoot, scriptFileName);

    if (!(await this._fileSystem.fileExists(scriptUri.fsPath))) {
      this._logging.warn(
        `Prerequisites [${options.correlationId}] step "${options.step}": script "${scriptFileName}" was not found.`
      );
      return this._toExecution(options.step, scriptFileName, {
        outcome: "scriptNotFound",
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: 0,
        truncated: false,
        failureReason: `${scriptFileName} is missing.`,
      });
    }

    const { command, args } = await this._buildInvocation(options, scriptUri);

    this._logging.info(
      `Prerequisites [${options.correlationId}] step "${options.step}": running ${command} ${args.join(" ")}`
    );

    const startedAt = this._clock.now();
    const result = await this._processRunner.run(command, args, {
      cwd: options.workspaceRoot.fsPath,
      timeoutMs: STEP_TIMEOUTS_MS[options.step],
      killGraceMs: KILL_GRACE_MS,
      // The child inherits the extension host environment unchanged. Windows
      // non-interactivity is enforced by `-Interactive:$false` (see
      // _buildInvocation); the shell scripts have no non-interactive switch and
      // read no environment flag, so nothing is injected here.
      cancellationToken: options.cancellationToken,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    });

    const execution = this._toExecution(options.step, scriptFileName, result);
    this._logExecution(options.correlationId, execution, this._clock.now() - startedAt);
    return execution;
  }

  /**
   * Maps a failed execution to a categorised, user-actionable error.
   * Returns `undefined` when the execution is not a hard failure.
   */
  public classifyFailure(execution: StepExecution): PrerequisiteError | undefined {
    const { result, step, scriptFileName } = execution;

    if (result.outcome === "scriptNotFound") {
      return new PrerequisiteError(
        "NotFound",
        `The "${step}" script (${scriptFileName}) is missing from the configured scripts folder.`,
        "The workspace's prerequisite setup is incomplete. Add the script, or update \"nexkit.prerequisites.scriptsPath\"."
      );
    }

    if (result.outcome === "timedOut") {
      return new PrerequisiteError(
        "Timeout",
        `The "${step}" script did not finish in time and was stopped.`,
        "See the Nexkit output log for details."
      );
    }

    if (result.outcome === "spawnFailed") {
      return new PrerequisiteError(
        "Execution",
        `The "${step}" script could not be started.`,
        "Verify that the required interpreter is installed and on PATH."
      );
    }

    if (result.outcome === "cancelled") {
      return new PrerequisiteError(
        "Cancelled",
        `The "${step}" script was cancelled.`,
        result.descendantsMaySurvive
          ? "Nexkit stopped the script, but a tool it had already launched may still be running. Check for a leftover installer before retrying."
          : "Run the command again when you are ready."
      );
    }

    if (MISSING_INTERACTIVE_PARAM_PATTERN.test(result.stderr)) {
      return new PrerequisiteError(
        "Configuration",
        `The "${step}" script does not accept the -Interactive switch.`,
        "Nexkit runs prerequisite scripts non-interactively. Update the script to declare an -Interactive switch parameter."
      );
    }

    if (EXECUTION_POLICY_PATTERN.test(result.stderr)) {
      return new PrerequisiteError(
        "Permission",
        `Windows blocked the "${step}" script from running.`,
        "Check your PowerShell execution policy, or unblock the script file."
      );
    }

    return undefined;
  }

  private _toExecution(step: PrerequisiteStep, scriptFileName: string, result: ScriptRunResult): StepExecution {
    const validated = result.outcome === "completed" ? parseValidationMarker(result.stdout) : undefined;
    const markerConflict =
      validated !== undefined && result.exitCode !== null && validated !== (result.exitCode === 0);

    return { step, scriptFileName, result, validated, markerConflict };
  }

  /**
   * Rich local diagnostics. Everything here stays in the output channel; only the
   * outcome enum, step, duration bucket, platform, and error category ever reach
   * telemetry.
   */
  private _logExecution(correlationId: string, execution: StepExecution, durationMs: number): void {
    const { result, step, scriptFileName } = execution;
    this._logging.info(
      `Prerequisites [${correlationId}] step "${step}" (${scriptFileName}) finished: ` +
        `outcome=${result.outcome} exitCode=${result.exitCode} durationMs=${durationMs} ` +
        `marker=${execution.validated ?? "none"} markerConflict=${execution.markerConflict} truncated=${result.truncated}`
    );

    if (result.stdout.length > 0) {
      this._logging.debug(`Prerequisites [${correlationId}] step "${step}" stdout:\n${result.stdout}`);
    }
    if (result.stderr.length > 0) {
      this._logging.warn(`Prerequisites [${correlationId}] step "${step}" stderr:\n${result.stderr}`);
    }
    if (execution.markerConflict) {
      this._logging.warn(
        `Prerequisites [${correlationId}] step "${step}": the ::VALIDATED:: marker disagrees with the exit code.`
      );
    }
  }

  private async _buildInvocation(
    options: RunStepOptions,
    scriptUri: vscode.Uri
  ): Promise<{ command: string; args: string[] }> {
    if (options.platform !== "win32") {
      // Explicit bash: the reference scripts use process substitution and
      // `declare -a`, neither of which works under sh/dash/zsh.
      return { command: "bash", args: [scriptUri.fsPath] };
    }

    const command = await this._resolvePowerShellCommand(options.workspaceRoot.fsPath, options.cancellationToken);
    const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptUri.fsPath];

    if (NON_INTERACTIVE_STEPS.has(options.step)) {
      args.push("-Interactive:$false");
    }

    return { command, args };
  }

  private async _resolvePowerShellCommand(
    cwd: string,
    cancellationToken?: vscode.CancellationToken
  ): Promise<string> {
    if (this._powerShellCommand) {
      return this._powerShellCommand;
    }

    for (const candidate of POWERSHELL_CANDIDATES) {
      const probe = await this._processRunner.run(
        candidate,
        ["-NoProfile", "-NonInteractive", "-Command", "exit 0"],
        {
          cwd,
          timeoutMs: PROBE_TIMEOUT_MS,
          killGraceMs: KILL_GRACE_MS,
          cancellationToken,
          maxOutputBytes: MAX_OUTPUT_BYTES,
        }
      );

      if (probe.outcome === "completed" && probe.exitCode === 0) {
        this._logging.info(`Prerequisites: using "${candidate}" to run PowerShell scripts.`);
        this._powerShellCommand = candidate;
        return candidate;
      }
    }

    // A cancelled probe proves nothing about the machine. Reporting "no
    // PowerShell host" here would blame the user's environment for their own
    // cancellation.
    if (cancellationToken?.isCancellationRequested) {
      throw new PrerequisiteError(
        "Cancelled",
        "The prerequisite check was cancelled while the PowerShell host was being located.",
        "Run the command again when you are ready."
      );
    }

    throw new PrerequisiteError(
      "NotFound",
      "No usable PowerShell host was found.",
      "Install PowerShell 7 (pwsh) or make powershell.exe available on PATH."
    );
  }

  private async _ensureJq(cwd: string, cancellationToken?: vscode.CancellationToken): Promise<void> {
    if (this._jqVerified) {
      return;
    }

    const probe = await this._processRunner.run("jq", ["--version"], {
      cwd,
      timeoutMs: PROBE_TIMEOUT_MS,
      killGraceMs: KILL_GRACE_MS,
      cancellationToken,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    });

    if (probe.outcome === "completed" && probe.exitCode === 0) {
      this._jqVerified = true;
      return;
    }

    // Same reasoning as the PowerShell probe: a cancelled probe is not evidence
    // that jq is missing.
    if (cancellationToken?.isCancellationRequested) {
      throw new PrerequisiteError(
        "Cancelled",
        "The prerequisite check was cancelled while jq was being located.",
        "Run the command again when you are ready."
      );
    }

    throw new PrerequisiteError(
      "Configuration",
      "The prerequisite shell scripts require jq, which was not found on PATH.",
      "Install jq (macOS: brew install jq — Debian/Ubuntu: sudo apt install jq), then run the command again."
    );
  }
}
