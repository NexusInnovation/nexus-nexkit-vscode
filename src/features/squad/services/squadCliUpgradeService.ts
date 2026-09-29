/**
 * SquadCliUpgradeService (SQD-031) — confirmed `squad upgrade --self`.
 *
 * Covers PRD FR-005: the CLI self-upgrade only runs after an update was
 * detected (SQD-030 contract) **and** the user explicitly confirmed it. The
 * upgrade runs through the allowlisted {@link SquadCliService} (no shell,
 * per-command timeout, cancellation) and the result is re-verified with a fresh
 * update check so a command that "succeeds" without actually upgrading never
 * produces a success state.
 *
 * CLI self-upgrades do not touch workspace files, so no BackupService call is
 * needed here (see `SquadUpdateCandidate.requiresBackup`); project upgrades are
 * handled separately (#247).
 */

import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SquadCliSource,
  SquadCliUpgradeOutcome,
  SquadError,
  SquadResult,
  SquadUpdatesResult,
  SquadVersionStatus,
  isSquadErr,
  squadErr,
  squadOk,
} from "../models";
import { SQUAD_CLI_NPX_PACKAGE, SquadCliCommand, SquadCliExecuteOptions, SquadCliExecution } from "./squadCliService";

/** Manual fallback shown in remediation when the automated upgrade fails. */
export const SQUAD_CLI_INSTALL_MANUAL_COMMAND = `npm install -g ${SQUAD_CLI_NPX_PACKAGE}@latest`;

/** Update-check seam, structurally satisfied by `SquadUpdateService`. */
export interface SquadCliUpgradeUpdateSource {
  checkUpdates(workspaceRoot?: vscode.Uri): Promise<SquadResult<SquadUpdatesResult>>;
}

/** CLI execution seam, structurally satisfied by `SquadCliService`. */
export interface SquadCliUpgradeExecutor {
  execute(command: SquadCliCommand, options?: SquadCliExecuteOptions): Promise<SquadResult<SquadCliExecution>>;
}

/** What the user is asked to confirm before the CLI self-upgrade runs. */
export interface SquadCliUpgradeConfirmationRequest {
  /** Currently installed CLI version. */
  currentVersion: string;

  /** Latest published CLI version. */
  latestVersion: string;

  /** How the CLI is resolved (global install or custom path). */
  source?: SquadCliSource;
}

/** Presents the confirmation dialog. Injectable so tests never open UI. */
export interface SquadCliUpgradeConfirmer {
  /** Return `true` only when the user explicitly approved the upgrade. */
  confirm(request: SquadCliUpgradeConfirmationRequest): Promise<boolean>;
}

/** Label of the confirmation button in the production modal. */
export const SQUAD_CLI_UPGRADE_CONFIRM_LABEL = "Upgrade CLI";

/** Modal-dialog confirmation used in production. */
export class VscodeSquadCliUpgradeConfirmer implements SquadCliUpgradeConfirmer {
  public async confirm(request: SquadCliUpgradeConfirmationRequest): Promise<boolean> {
    const detail = [
      `Current version: ${request.currentVersion}`,
      `Latest version: ${request.latestVersion}`,
      "NexKit will run `squad upgrade --self`. Your workspace files are not modified.",
      request.source === SquadCliSource.Custom
        ? "Your CLI is resolved from a custom path; make sure that installation can be upgraded by npm."
        : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");

    const choice = await vscode.window.showWarningMessage(
      "Upgrade the Squad CLI?",
      { modal: true, detail },
      SQUAD_CLI_UPGRADE_CONFIRM_LABEL
    );
    return choice === SQUAD_CLI_UPGRADE_CONFIRM_LABEL;
  }
}

/** Options for a single {@link SquadCliUpgradeService.upgradeCli} call. */
export interface SquadCliUpgradeOptions {
  /** Workspace root used as the CLI working directory and for detection. */
  workspaceRoot?: vscode.Uri;

  /** Cancellation token forwarded to the CLI process. */
  token?: vscode.CancellationToken;
}

/** Constructor dependencies; seams have production defaults. */
export interface SquadCliUpgradeServiceOptions {
  /** Update-check source (SQD-030). */
  updates: SquadCliUpgradeUpdateSource;

  /** Allowlisted CLI executor. */
  cli: SquadCliUpgradeExecutor;

  /** Confirmation seam; defaults to a VS Code modal. */
  confirmer?: SquadCliUpgradeConfirmer;

  /** Logger; defaults to the shared {@link LoggingService} singleton. */
  logger?: LoggingService;
}

/**
 * Runs the confirmed Squad CLI self-upgrade. Every failure (check failure,
 * missing/unknown CLI, declined confirmation, CLI failure, timeout,
 * cancellation, unverified upgrade, concurrent run) returns an actionable
 * {@link SquadError}; success is only reported once the new version is verified.
 */
export class SquadCliUpgradeService {
  private readonly _updates: SquadCliUpgradeUpdateSource;
  private readonly _cli: SquadCliUpgradeExecutor;
  private readonly _confirmer: SquadCliUpgradeConfirmer;
  private readonly _logger: LoggingService;
  private _inProgress = false;

  constructor(options: SquadCliUpgradeServiceOptions) {
    this._updates = options.updates;
    this._cli = options.cli;
    this._confirmer = options.confirmer ?? new VscodeSquadCliUpgradeConfirmer();
    this._logger = options.logger ?? LoggingService.getInstance();
  }

  /** Whether an upgrade is currently running. */
  public get isUpgrading(): boolean {
    return this._inProgress;
  }

  public async upgradeCli(options: SquadCliUpgradeOptions = {}): Promise<SquadResult<SquadCliUpgradeOutcome>> {
    if (this._inProgress) {
      return squadErr({
        code: "upgrade-failed",
        message: "A Squad CLI upgrade is already in progress.",
        remediation: "Wait for the current upgrade to finish, then check for updates again.",
      });
    }

    this._inProgress = true;
    try {
      return await this._upgrade(options);
    } finally {
      this._inProgress = false;
    }
  }

  private async _upgrade(options: SquadCliUpgradeOptions): Promise<SquadResult<SquadCliUpgradeOutcome>> {
    const before = await this._updates.checkUpdates(options.workspaceRoot);
    if (isSquadErr(before)) {
      return before;
    }

    const { cli } = before.value.detection;
    const candidate = before.value.cli;
    if (!cli.installed || !candidate.currentVersion) {
      return squadErr({
        code: "cli-not-found",
        message: "The Squad CLI is not installed, so it cannot be upgraded.",
        remediation: `Install it with \`${SQUAD_CLI_INSTALL_MANUAL_COMMAND}\`, then refresh Squad detection.`,
      });
    }

    const currentVersion = candidate.currentVersion;
    if (candidate.status === SquadVersionStatus.Unknown || !candidate.latestVersion) {
      return squadErr({
        code: "version-unknown",
        message: "NexKit could not determine whether a Squad CLI upgrade is available.",
        remediation: "Check for Squad updates again. If the installed CLI is a source build, upgrade it manually.",
        detail: `current=${currentVersion}`,
      });
    }

    const latestVersion = candidate.latestVersion;
    if (!candidate.updateAvailable) {
      return squadOk({
        upgraded: false,
        previousVersion: currentVersion,
        installedVersion: currentVersion,
        latestVersion,
        source: cli.source,
        updates: before.value,
      });
    }

    const confirmed = await this._confirmer.confirm({ currentVersion, latestVersion, source: cli.source });
    if (!confirmed) {
      return squadErr({
        code: "cancelled",
        message: "The Squad CLI upgrade was cancelled.",
        remediation: "Run the upgrade again when you are ready to proceed.",
      });
    }

    this._logger.info("Squad CLI upgrade confirmed; running `squad upgrade --self`.");
    const execution = await this._cli.execute(SquadCliCommand.UpgradeSelf, {
      cwd: options.workspaceRoot,
      source: cli.source,
      token: options.token,
    });
    if (isSquadErr(execution)) {
      this._logger.warn("Squad CLI upgrade failed.", execution.error);
      return squadErr(this._toUpgradeError(execution.error));
    }

    return this._verify(options.workspaceRoot, currentVersion, latestVersion);
  }

  /** Re-check the installed version so an ineffective upgrade is never reported as success. */
  private async _verify(
    workspaceRoot: vscode.Uri | undefined,
    previousVersion: string,
    targetVersion: string
  ): Promise<SquadResult<SquadCliUpgradeOutcome>> {
    const after = await this._updates.checkUpdates(workspaceRoot);
    if (isSquadErr(after)) {
      return squadErr({
        code: "upgrade-failed",
        message: "The Squad CLI upgrade ran, but the new version could not be verified.",
        remediation: "Refresh Squad detection or run `squad version` in a terminal to confirm the installed version.",
        detail: after.error.code,
        cause: after.error,
      });
    }

    const cli = after.value.detection.cli;
    const candidate = after.value.cli;
    const installedVersion = candidate.currentVersion;
    if (!cli.installed || !installedVersion || candidate.status !== SquadVersionStatus.UpToDate) {
      return squadErr({
        code: "upgrade-failed",
        message: `The Squad CLI upgrade did not take effect (still ${installedVersion ?? "unknown"}, expected ${targetVersion}).`,
        remediation: `Run \`${SQUAD_CLI_INSTALL_MANUAL_COMMAND}\` in a terminal (or update your custom CLI path), then refresh Squad detection.`,
        detail: `previous=${previousVersion} installed=${installedVersion ?? "unknown"} target=${targetVersion}`,
      });
    }

    this._logger.info(`Squad CLI upgraded from ${previousVersion} to ${installedVersion}.`);
    return squadOk({
      upgraded: true,
      previousVersion,
      installedVersion,
      latestVersion: candidate.latestVersion ?? targetVersion,
      source: cli.source,
      updates: after.value,
    });
  }

  /** Keep cancellation/timeout/not-found codes; re-scope generic failures to `upgrade-failed`. */
  private _toUpgradeError(error: SquadError): SquadError {
    if (error.code !== "cli-execution-failed") {
      return error;
    }
    return {
      code: "upgrade-failed",
      message: error.message.replace(/^The Squad "upgrade-self" command failed/, "The Squad CLI upgrade failed"),
      remediation: `Review the Nexkit output channel, or run \`${SQUAD_CLI_INSTALL_MANUAL_COMMAND}\` manually, then refresh Squad detection.`,
      detail: error.detail,
      cause: error.cause,
    };
  }
}
