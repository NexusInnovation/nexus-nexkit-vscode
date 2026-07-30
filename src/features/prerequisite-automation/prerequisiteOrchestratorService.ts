import { randomUUID } from "crypto";
import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { ConfirmationService } from "../../shared/services/confirmationService";
import { TelemetryService } from "../../shared/services/telemetryService";
import { PrerequisiteConfigService } from "./prerequisiteConfigService";
import { PrerequisiteRunnerService } from "./prerequisiteRunnerService";
import { isSupportedPlatform } from "./scriptResolver";
import {
  IClock,
  IPrerequisiteLogger,
  OrchestrationOutcome,
  OrchestrationResult,
  Prerequisite,
  PrerequisiteConfig,
  PrerequisiteError,
  PrerequisiteStep,
  StepExecution,
  systemClock,
} from "./types";

const TELEMETRY_EVENT = "prerequisites.run";

/**
 * Buckets keep telemetry free of anything that could correlate to a machine or a
 * particular workspace.
 */
export function toDurationBucket(durationMs: number): string {
  if (durationMs < 5_000) {
    return "0-5s";
  }
  if (durationMs < 30_000) {
    return "5-30s";
  }
  if (durationMs < 120_000) {
    return "30s-2m";
  }
  if (durationMs < 600_000) {
    return "2m-10m";
  }
  return "10m+";
}

/**
 * Drives the `check -> validate -> setup` state machine.
 *
 * The only component that knows the flow. Every process execution reaches it
 * through {@link PrerequisiteRunnerService}, so the entire machine is drivable
 * from scripted results with no real script, no real shell, and no platform
 * dependency.
 */
export class PrerequisiteOrchestratorService {
  private _inFlight: Promise<OrchestrationResult> | undefined;

  public constructor(
    private readonly _configService: PrerequisiteConfigService,
    private readonly _runner: PrerequisiteRunnerService,
    private readonly _confirmation: ConfirmationService,
    private readonly _logging: IPrerequisiteLogger,
    private readonly _telemetry: TelemetryService,
    private readonly _clock: IClock = systemClock,
    private readonly _platform: NodeJS.Platform = process.platform,
    private readonly _isWorkspaceTrusted: () => boolean = () => vscode.workspace.isTrusted
  ) {}

  public get isRunning(): boolean {
    return this._inFlight !== undefined;
  }

  /**
   * Runs the full flow. A second concurrent invocation is refused rather than
   * queued: two overlapping installer runs can corrupt a machine.
   */
  public async run(externalToken?: vscode.CancellationToken): Promise<OrchestrationResult> {
    if (this._inFlight) {
      this._logging.warn("Prerequisites: a validation run is already in progress.");
      return {
        outcome: "alreadyRunning",
        furthestStep: "none",
        durationMs: 0,
        correlationId: "",
        steps: [],
        error: new PrerequisiteError(
          "Concurrency",
          "A prerequisite validation run is already in progress.",
          "Wait for it to finish before starting another."
        ),
      };
    }

    this._inFlight = this._runGuarded(externalToken);
    try {
      return await this._inFlight;
    } finally {
      this._inFlight = undefined;
    }
  }

  private async _runGuarded(externalToken?: vscode.CancellationToken): Promise<OrchestrationResult> {
    const correlationId = randomUUID();
    const startedAt = this._clock.now();

    const finish = (
      outcome: OrchestrationOutcome,
      furthestStep: PrerequisiteStep | "none",
      steps: StepExecution[],
      error?: PrerequisiteError
    ): OrchestrationResult => {
      const result: OrchestrationResult = {
        outcome,
        furthestStep,
        durationMs: this._clock.now() - startedAt,
        correlationId,
        steps,
        error,
      };
      this._trackTelemetry(result);
      this._logging.info(
        `Prerequisites [${correlationId}] finished: outcome=${outcome} furthestStep=${furthestStep} durationMs=${result.durationMs}`
      );
      return result;
    };

    if (!this._isWorkspaceTrusted()) {
      const error = new PrerequisiteError(
        "Trust",
        "Prerequisite scripts cannot run in a Restricted Mode workspace.",
        "Trust this workspace to allow Nexkit to run its prerequisite scripts."
      );
      this._logging.warn(`Prerequisites [${correlationId}]: refused — workspace is not trusted.`);
      return finish("failed", "none", [], error);
    }

    if (!isSupportedPlatform(this._platform)) {
      return finish(
        "failed",
        "none",
        [],
        new PrerequisiteError(
          "Configuration",
          `Prerequisite automation does not support the "${this._platform}" platform.`,
          "Supported platforms are Windows, Linux, and macOS."
        )
      );
    }

    let loadResult;
    try {
      loadResult = await this._configService.load();
    } catch (error) {
      return finish("failed", "none", [], this._toPrerequisiteError(error));
    }

    if (loadResult.kind === "absent") {
      this._logging.info(`Prerequisites [${correlationId}]: this workspace has no prerequisites configuration.`);
      return finish("notConfigured", "none", []);
    }

    const { config, scriptsRoot, workspaceRoot } = loadResult;

    const consent = await this._confirmation.confirm(
      "Run prerequisite scripts?",
      `Nexkit will run the prerequisite scripts found in this workspace to verify your development environment.\n\nScripts folder: ${scriptsRoot.fsPath}`,
      SettingsManager.CONFIRMATION_KEYS.PREREQUISITES_RUN
    );

    if (consent !== "accepted") {
      this._logging.info(`Prerequisites [${correlationId}]: the user declined to run the scripts.`);
      return finish("declined", "none", []);
    }

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Nexkit: checking development prerequisites",
        cancellable: true,
      },
      async (progress, progressToken) => {
        const tokenSource = new vscode.CancellationTokenSource();
        const subscriptions: vscode.Disposable[] = [
          progressToken.onCancellationRequested(() => tokenSource.cancel()),
        ];
        if (externalToken) {
          subscriptions.push(externalToken.onCancellationRequested(() => tokenSource.cancel()));
          if (externalToken.isCancellationRequested) {
            tokenSource.cancel();
          }
        }

        try {
          return await this._runStateMachine({
            correlationId,
            config,
            scriptsRoot,
            workspaceRoot,
            progress,
            token: tokenSource.token,
            finish,
          });
        } catch (error) {
          return finish("failed", "none", [], this._toPrerequisiteError(error));
        } finally {
          subscriptions.forEach((subscription) => subscription.dispose());
          tokenSource.dispose();
        }
      }
    );
  }

  private async _runStateMachine(context: {
    correlationId: string;
    config: PrerequisiteConfig;
    scriptsRoot: vscode.Uri;
    workspaceRoot: vscode.Uri;
    progress: vscode.Progress<{ message?: string }>;
    token: vscode.CancellationToken;
    finish: (
      outcome: OrchestrationOutcome,
      furthestStep: PrerequisiteStep | "none",
      steps: StepExecution[],
      error?: PrerequisiteError
    ) => OrchestrationResult;
  }): Promise<OrchestrationResult> {
    const { correlationId, config, scriptsRoot, workspaceRoot, progress, token, finish } = context;
    const steps: StepExecution[] = [];

    const runStep = async (step: PrerequisiteStep): Promise<StepExecution> => {
      const execution = await this._runner.runStep({
        step,
        scriptsRoot,
        workspaceRoot,
        platform: this._platform,
        correlationId,
        cancellationToken: token,
      });
      steps.push(execution);
      return execution;
    };

    /**
     * Cancellation is only a clean stop when the kill actually reached the whole
     * process tree. When it did not, the user is told rather than left believing
     * an installer was stopped when it is still running.
     */
    const cancelledAt = (furthestStep: PrerequisiteStep | "none"): OrchestrationResult => {
      const orphaned = steps.some((execution) => execution.result.descendantsMaySurvive === true);
      if (!orphaned) {
        return finish("cancelled", furthestStep, steps);
      }

      this._logging.warn(
        `Prerequisites [${correlationId}]: cancelled, but the process tree could not be fully terminated.`
      );
      return finish(
        "cancelled",
        furthestStep,
        steps,
        new PrerequisiteError(
          "Cancelled",
          "The prerequisite run was cancelled, but a tool it had already started may still be running.",
          "Check for a leftover installer process before running the command again."
        )
      );
    };

    progress.report({ message: "verifying the script environment" });
    try {
      await this._runner.ensureEnvironment(this._platform, workspaceRoot.fsPath, token);
    } catch (error) {
      // A probe that was interrupted proves nothing about the machine, so it must
      // not be reported as a missing interpreter.
      if (token.isCancellationRequested) {
        return cancelledAt("none");
      }
      return finish("failed", "none", steps, this._toPrerequisiteError(error));
    }

    // The workspaceState cache is never consulted here: the check script's own
    // output is the authoritative answer, and the cache only mirrors it.
    progress.report({ message: "checking whether prerequisites are already validated" });
    const initialCheck = await runStep("check");
    if (token.isCancellationRequested) {
      return cancelledAt("check");
    }

    const initialCheckFailure = this._runner.classifyFailure(initialCheck);
    if (initialCheckFailure) {
      return finish("failed", "check", steps, initialCheckFailure);
    }

    if (this._isValidated(initialCheck)) {
      await this._cacheValidationState(true);
      return finish("alreadyValidated", "check", steps);
    }

    progress.report({ message: "validating required tools" });
    const validate = await runStep("validate");
    if (token.isCancellationRequested) {
      return cancelledAt("validate");
    }

    const validateFailure = this._runner.classifyFailure(validate);
    if (validateFailure) {
      return finish("failed", "validate", steps, validateFailure);
    }

    if (validate.result.exitCode === 0) {
      const confirmCheck = await runStep("check");
      if (this._isValidated(confirmCheck)) {
        await this._cacheValidationState(true);
        return finish("validated", "check", steps);
      }

      await this._cacheValidationState(false);
      this._logging.warn(
        `Prerequisites [${correlationId}]: validation succeeded but the validated state was not persisted by the scripts.`
      );
      return finish(
        "validationNotPersisted",
        "check",
        steps,
        new PrerequisiteError(
          "Configuration",
          "The validation script reported success but did not record the validated state.",
          "The workspace's validate script is not writing its validation state. See the Nexkit output log."
        )
      );
    }

    await this._cacheValidationState(false);

    const installConsent = await this._confirmation.confirmOnce(
      "Install missing prerequisites?",
      this._buildSetupConsentDetail(config)
    );

    if (!installConsent) {
      this._logging.info(`Prerequisites [${correlationId}]: the user declined the environment setup.`);
      return finish("setupDeclined", "validate", steps);
    }

    if (token.isCancellationRequested) {
      return cancelledAt("validate");
    }

    progress.report({ message: "setting up the environment (this can take several minutes)" });
    const setup = await runStep("setup");
    if (token.isCancellationRequested) {
      return cancelledAt("setup");
    }

    const setupFailure = this._runner.classifyFailure(setup);
    if (setupFailure) {
      return finish("failed", "setup", steps, setupFailure);
    }

    if (setup.result.exitCode !== 0) {
      // Deliberately no retry: re-running a partially-succeeded installer can
      // leave the machine in a worse state than failing cleanly.
      return finish(
        "setupFailed",
        "setup",
        steps,
        new PrerequisiteError(
          "Execution",
          "The environment setup script did not complete successfully.",
          "See the Nexkit output log, then install the remaining tools manually."
        )
      );
    }

    progress.report({ message: "confirming the environment" });
    const finalCheck = await runStep("check");
    if (this._isValidated(finalCheck)) {
      await this._cacheValidationState(true);
      return finish("validated", "check", steps);
    }

    await this._cacheValidationState(false);
    return finish(
      "stillInvalid",
      "check",
      steps,
      new PrerequisiteError(
        "Execution",
        "Setup completed but the prerequisites are still reported as not validated.",
        "See the Nexkit output log for the remaining problems."
      )
    );
  }

  /**
   * A phase counts as validated only when the exit code and the emitted marker
   * agree. A conflict is treated as "not validated" and logged by the runner.
   */
  private _isValidated(execution: StepExecution): boolean {
    if (execution.result.outcome !== "completed" || execution.result.exitCode !== 0) {
      return false;
    }
    return execution.validated !== false;
  }

  /**
   * Mirrors the authoritative answer into `workspaceState`. Purely a cache for
   * UI affordances; it never short-circuits the check step.
   */
  private async _cacheValidationState(validated: boolean): Promise<void> {
    try {
      await SettingsManager.setPrerequisitesValidated(validated);
      await SettingsManager.setPrerequisitesValidationDate(new Date(this._clock.now()).toISOString());
    } catch (error) {
      this._logging.warn("Prerequisites: unable to cache the validation state.", error);
    }
  }

  private _buildSetupConsentDetail(config: PrerequisiteConfig): string {
    const required = config.prerequisites.filter((prerequisite) => prerequisite.required);
    const listed = (required.length > 0 ? required : config.prerequisites).slice(0, 10);
    const lines = listed.map((prerequisite) => `• ${this._describePrerequisite(prerequisite)}`);

    return (
      "Nexkit will run this workspace's setup script, which can install software on your machine.\n\n" +
      `Declared prerequisites:\n${lines.join("\n")}\n\n` +
      "Only continue if you trust this workspace."
    );
  }

  /**
   * Install strings are rendered as plain text only. They come from the workspace
   * and are never executed, interpolated, or sent to a terminal.
   */
  private _describePrerequisite(prerequisite: Prerequisite): string {
    const version = prerequisite.minimumVersion ? ` (>= ${prerequisite.minimumVersion})` : "";
    const hint = prerequisite.install?.hint ? ` — ${prerequisite.install.hint}` : "";
    return `${prerequisite.name}${version}${hint}`;
  }

  private _trackTelemetry(result: OrchestrationResult): void {
    this._telemetry.trackEvent(TELEMETRY_EVENT, {
      outcome: result.outcome,
      furthestStep: result.furthestStep,
      durationBucket: toDurationBucket(result.durationMs),
      platform: this._platform,
      errorCategory: result.error?.category ?? "none",
    });
  }

  private _toPrerequisiteError(error: unknown): PrerequisiteError {
    if (error instanceof PrerequisiteError) {
      return error;
    }
    this._logging.error("Prerequisites: unexpected failure.", error);
    return new PrerequisiteError(
      "Execution",
      "Prerequisite validation failed unexpectedly.",
      "See the Nexkit output log for details."
    );
  }
}
