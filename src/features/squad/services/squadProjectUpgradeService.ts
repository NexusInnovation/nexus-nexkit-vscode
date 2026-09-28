/**
 * SquadProjectUpgradeService (SQD-032) — run a confirmed, backed-up
 * `squad upgrade` in the current workspace.
 *
 * Implements PRD FR-005 (never run `squad upgrade` without explicit user
 * confirmation) and FR-006 (back up Squad artifacts via BackupService before
 * the upgrade). The flow, in order, is:
 *
 *  1. Resolve the workspace root (fail `not-a-workspace` when none is open).
 *  2. Re-check updates through {@link SquadUpdateService} (SQD-030) so the
 *     confirmation always reflects the current project/latest versions.
 *  3. Refuse when no Squad project exists; report `upToDate` (no CLI run, no
 *     backup) when the project is already current.
 *  4. Ask for explicit confirmation. Declining returns `cancelled`.
 *  5. Back up `.squad/` and `.github/agents/squad.agent.md`. A backup failure,
 *     or a backup that captured nothing, aborts before the CLI runs.
 *  6. Run the allowlisted `squad upgrade --force` via {@link SquadCliService}.
 *  7. On CLI failure, restore the backup and return an actionable error —
 *     never a success state.
 *  8. Re-run detection so the panel reflects the upgraded project version.
 */

import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SquadDetectionResult,
  SquadError,
  SquadInstallState,
  SquadResult,
  SquadUpdatesResult,
  SquadVersionStatus,
  isSquadErr,
  squadErr,
  squadOk,
} from "../models";
import { SquadCliCommand, SquadCliExecuteOptions, SquadCliExecution } from "./squadCliService";
import { SquadArtifactBackup } from "./squadInitService";

/** Allowlisted arguments for a non-interactive, already-confirmed project upgrade. */
const PROJECT_UPGRADE_ARGS: readonly string[] = ["--force"];

/** What the user is asked to confirm before `squad upgrade` runs. */
export interface SquadProjectUpgradeConfirmationRequest {
  /** Absolute workspace root the upgrade runs in. */
  workspaceRoot: string;

  /** Stamped project version, or `null` when unknown. */
  currentVersion: string | null;

  /** Latest known Squad version, or `null` when unknown. */
  latestVersion: string | null;

  /** Freshness status; `unknown` means the upgrade target cannot be verified. */
  status: SquadVersionStatus;
}

/** Presents the confirmation dialog. Injectable so tests never open UI. */
export interface SquadProjectUpgradeConfirmer {
  /** Return `true` only when the user explicitly approved the upgrade. */
  confirm(request: SquadProjectUpgradeConfirmationRequest): Promise<boolean>;
}

/** Update-check seam (satisfied by {@link SquadUpdateService}). */
export interface SquadProjectUpgradeUpdateSource {
  checkUpdates(workspaceRoot?: vscode.Uri): Promise<SquadResult<SquadUpdatesResult>>;
}

/** CLI seam (satisfied by {@link SquadCliService}). */
export interface SquadProjectUpgradeCli {
  execute(command: SquadCliCommand, options?: SquadCliExecuteOptions): Promise<SquadResult<SquadCliExecution>>;
}

/** Detection seam used to refresh state after a successful upgrade. */
export interface SquadProjectUpgradeDetection {
  detect(workspaceRoot?: vscode.Uri): Promise<SquadResult<SquadDetectionResult>>;
}

/** Successful outcome of a project-upgrade request. */
export interface SquadProjectUpgradeOutcome {
  /** `true` when `squad upgrade` ran; `false` when the project was already current. */
  upgraded: boolean;

  /** Project version before the upgrade, or `null` when unknown. */
  previousVersion: string | null;

  /** Latest version targeted by the upgrade, or `null` when unknown. */
  targetVersion: string | null;

  /** Project version detected after the upgrade, or `null` when unknown. */
  currentVersion: string | null;

  /** Absolute backup path taken before the upgrade (`null` when nothing ran). Host-side only. */
  backupPath: string | null;

  /** Fresh detection snapshot, when available. */
  detection?: SquadDetectionResult;
}

/** Per-call options. */
export interface SquadProjectUpgradeRequestOptions {
  /** Cancels the running CLI process; the backup is then restored. */
  token?: vscode.CancellationToken;
}

/** Constructor dependencies. Core services are required; UI/workspace seams have defaults. */
export interface SquadProjectUpgradeServiceOptions {
  updates: SquadProjectUpgradeUpdateSource;
  cli: SquadProjectUpgradeCli;
  backup: SquadArtifactBackup;
  detection: SquadProjectUpgradeDetection;
  confirmer?: SquadProjectUpgradeConfirmer;
  logger?: LoggingService;
  getWorkspaceRoot?: () => vscode.Uri | undefined;
}

/** Modal-dialog confirmation used in production. */
export class VscodeSquadProjectUpgradeConfirmer implements SquadProjectUpgradeConfirmer {
  public async confirm(request: SquadProjectUpgradeConfirmationRequest): Promise<boolean> {
    const versionLine =
      request.status === SquadVersionStatus.UpdateAvailable
        ? `• Upgrade Squad project files from ${request.currentVersion} to ${request.latestVersion}.`
        : "• The current project version could not be compared with the latest Squad version; the upgrade will apply the version provided by your Squad CLI.";
    const lines = [
      versionLine,
      "• Your existing .squad/ and .github/agents/squad.agent.md will be backed up first.",
      "• Run `squad upgrade --force`, which overwrites Squad-owned files (squad.agent.md, .squad/templates/) without further prompts.",
      "• If the upgrade fails, the backup is restored automatically.",
    ];

    const choice = await vscode.window.showWarningMessage(
      "Upgrade the Squad project in this workspace?",
      { modal: true, detail: lines.join("\n") },
      "Upgrade"
    );
    return choice === "Upgrade";
  }
}

/** Runs a confirmed, backed-up `squad upgrade` (FR-005/FR-006). */
export class SquadProjectUpgradeService {
  private readonly _updates: SquadProjectUpgradeUpdateSource;
  private readonly _cli: SquadProjectUpgradeCli;
  private readonly _backup: SquadArtifactBackup;
  private readonly _detection: SquadProjectUpgradeDetection;
  private readonly _confirmer: SquadProjectUpgradeConfirmer;
  private readonly _logger: LoggingService;
  private readonly _getWorkspaceRoot: () => vscode.Uri | undefined;

  constructor(options: SquadProjectUpgradeServiceOptions) {
    this._updates = options.updates;
    this._cli = options.cli;
    this._backup = options.backup;
    this._detection = options.detection;
    this._confirmer = options.confirmer ?? new VscodeSquadProjectUpgradeConfirmer();
    this._logger = options.logger ?? LoggingService.getInstance();
    this._getWorkspaceRoot = options.getWorkspaceRoot ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri);
  }

  /**
   * Upgrade the Squad project in the current workspace. The failure branch
   * always carries an actionable {@link SquadError}, including `cancelled` when
   * the user declines, so a failed or refused upgrade never looks successful.
   */
  public async upgradeProject(
    options: SquadProjectUpgradeRequestOptions = {}
  ): Promise<SquadResult<SquadProjectUpgradeOutcome>> {
    const workspaceUri = this._getWorkspaceRoot();
    if (!workspaceUri) {
      return squadErr({
        code: "not-a-workspace",
        message: "Cannot upgrade the Squad project without an open workspace folder.",
        remediation: "Open the repository containing .squad/, then try upgrading again.",
      });
    }
    const workspaceRoot = workspaceUri.fsPath;

    const updates = await this._updates.checkUpdates(workspaceUri);
    if (isSquadErr(updates)) {
      return updates;
    }

    const { project, detection } = updates.value;
    if (detection.project.installState === SquadInstallState.NotInstalled) {
      return squadErr({
        code: "detection-failed",
        message: "No Squad project was detected in this workspace, so there is nothing to upgrade.",
        remediation: "Initialise Squad in this workspace first, then check for updates again.",
      });
    }

    if (project.status === SquadVersionStatus.UpToDate) {
      return squadOk({
        upgraded: false,
        previousVersion: project.currentVersion,
        targetVersion: project.latestVersion,
        currentVersion: project.currentVersion,
        backupPath: null,
        detection,
      });
    }

    const confirmed = await this._confirmer.confirm({
      workspaceRoot,
      currentVersion: project.currentVersion,
      latestVersion: project.latestVersion,
      status: project.status,
    });
    if (!confirmed) {
      return squadErr({
        code: "cancelled",
        message: "The Squad project upgrade was cancelled. Nothing was changed.",
        remediation: "Run the project upgrade again when you are ready to proceed.",
      });
    }

    const backupResult = await this._createBackup(workspaceRoot);
    if (isSquadErr(backupResult)) {
      return backupResult;
    }
    const backupPath = backupResult.value;

    const cliResult = await this._cli.execute(SquadCliCommand.Upgrade, {
      cwd: workspaceUri,
      args: [...PROJECT_UPGRADE_ARGS],
      token: options.token,
    });
    if (isSquadErr(cliResult)) {
      return squadErr(await this._handleCliFailure(workspaceRoot, backupPath, cliResult.error));
    }

    const refreshed = await this._safeDetect(workspaceUri);
    this._logger.info("Squad project upgrade completed.", {
      previousVersion: project.currentVersion,
      currentVersion: refreshed?.project.projectVersion ?? null,
    });

    return squadOk({
      upgraded: true,
      previousVersion: project.currentVersion,
      targetVersion: project.latestVersion,
      currentVersion: refreshed?.project.projectVersion ?? null,
      backupPath,
      ...(refreshed ? { detection: refreshed } : {}),
    });
  }

  /** Back up Squad artifacts; any failure or empty backup aborts before the CLI runs. */
  private async _createBackup(workspaceRoot: string): Promise<SquadResult<string>> {
    let backupPath: string | null;
    try {
      backupPath = await this._backup.backupSquadArtifacts(workspaceRoot);
    } catch (error) {
      this._logger.error("Squad upgrade: backup failed, aborting before `squad upgrade`", error);
      return squadErr({
        code: "backup-failed",
        message: "Could not back up your Squad files, so the project upgrade was aborted.",
        remediation:
          "Ensure the Nexkit backup location is writable and you have free disk space, then try again. Nothing was changed.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }

    if (!backupPath) {
      return squadErr({
        code: "backup-failed",
        message: "No Squad files were found to back up, so the project upgrade was aborted.",
        remediation: "Refresh Squad detection and verify .squad/ exists in this workspace. Nothing was changed.",
      });
    }

    return squadOk(backupPath);
  }

  /**
   * Restore the backup after a failed CLI run (unless the CLI never started)
   * and return an error describing both the failure and the restore outcome.
   */
  private async _handleCliFailure(workspaceRoot: string, backupPath: string, error: SquadError): Promise<SquadError> {
    if (error.code === "cli-not-found") {
      this._logger.warn("Squad upgrade: CLI not found; no files were changed", error);
      return {
        ...error,
        message: `${error.message} The Squad project was not upgraded and no files were changed.`,
      };
    }

    try {
      await this._backup.restoreSquadArtifacts(workspaceRoot, backupPath);
    } catch (restoreError) {
      this._logger.error(`Squad upgrade: failed to restore backup from ${backupPath}`, restoreError);
      return {
        ...error,
        message: `The Squad project upgrade failed and your previous Squad files could not be restored automatically. ${error.message}`,
        remediation:
          "Restore .squad/ and .github/agents/squad.agent.md manually from the latest squad-* folder in the Nexkit backup directory (see the Nexkit output channel), then retry the upgrade.",
      };
    }

    this._logger.warn("Squad upgrade: `squad upgrade` failed, backup restored", error);
    return {
      ...error,
      message: `The Squad project upgrade failed; your previous Squad files were restored from the backup. ${error.message}`,
      remediation: error.remediation ?? "Review the Nexkit output channel, then retry the Squad project upgrade.",
    };
  }

  /** Re-run detection, degrading to `undefined` on failure (never throws). */
  private async _safeDetect(workspaceUri: vscode.Uri): Promise<SquadDetectionResult | undefined> {
    try {
      const result = await this._detection.detect(workspaceUri);
      if (isSquadErr(result)) {
        this._logger.warn("Squad upgrade: post-upgrade detection failed", result.error);
        return undefined;
      }
      return result.value;
    } catch (error) {
      this._logger.warn("Squad upgrade: post-upgrade detection threw", error);
      return undefined;
    }
  }
}
