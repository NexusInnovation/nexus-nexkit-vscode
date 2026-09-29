/**
 * Consult mode support (SQD-052 / FR-064).
 *
 * `squad consult` copies the personal Squad into the current workspace,
 * marks `.squad/config.json` with `"consult": true`, and relies on the Squad
 * CLI to exclude local consult artifacts from git. `squad extract` merges the
 * learnings back into the personal Squad. This service keeps those local and
 * personal scopes explicit, reuses SQD-051 personal detection, and routes all
 * writes through confirmation, BackupService and the allowlisted CLI.
 */

import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  CONSULT_MODE_EXTRACT_WARNING,
  CONSULT_MODE_SCOPE_WARNING,
  SquadConsultModeOperation,
  SquadConsultModeState,
  SquadPersonalSquadState,
  type SquadConsultModeOutcome,
  type SquadConsultModeStatus,
  type SquadDetectionResult,
  type SquadError,
  type SquadResult,
  isSquadErr,
  squadErr,
  squadOk,
} from "../models";
import { SquadCliCommand, SquadCliService } from "./squadCliService";
import type { SquadDetectionService } from "./squadDetectionService";
import type { SquadArtifactBackup } from "./squadInitService";
import type { SquadPersonalSquadService } from "./squadPersonalSquadService";

const CONSULT_CONFIG_RELATIVE_PATH = ".squad/config.json";
const CONSULT_TARGET_LABEL = "this workspace (.squad/)";
const CONSULT_EXCLUDED_RELATIVE_PATHS = [".squad/", ".github/agents/squad.agent.md"] as const;

/** Request shown before running consult-mode CLI operations. */
export interface SquadConsultModeConfirmationRequest {
  /** Operation that will run. */
  operation: SquadConsultModeOperation;

  /** Human-readable target that avoids exposing absolute paths. */
  targetLabel: string;

  /** CLI command that will run. */
  commandPreview: readonly string[];

  /** Warning that explains whether workspace or personal scope changes. */
  warning: string;
}

/** Confirmation seam so tests never show VS Code UI. */
export interface SquadConsultModeConfirmer {
  /** Return true only when the user explicitly approves the consult operation. */
  confirm(request: SquadConsultModeConfirmationRequest): Promise<boolean>;
}

/** Minimal file-system seam used to read `.squad/config.json`. */
export interface SquadConsultModeFileSystem {
  /** Read a UTF-8 file. Missing files should reject with a not-found error. */
  readFile(uri: vscode.Uri): Promise<string>;
}

/** Constructor seams for deterministic tests. */
export interface SquadConsultModeServiceOptions {
  /** Allowlisted CLI wrapper used to run `squad consult` / `squad extract`. */
  cli: SquadCliService;

  /** Personal Squad detection from SQD-051. */
  personal: Pick<SquadPersonalSquadService, "getStatus">;

  /** Backup service for workspace Squad artifacts before consult/extract writes. */
  backup: SquadArtifactBackup;

  /** Detection service, re-run after successful operations when possible. */
  detection: Pick<SquadDetectionService, "detect">;

  /** Confirmation UI seam. */
  confirmer?: SquadConsultModeConfirmer;

  /** Config file read seam. */
  fileSystem?: SquadConsultModeFileSystem;

  /** Resolves the workspace root; defaults to the first open workspace folder. */
  getWorkspaceRoot?: () => vscode.Uri | undefined;

  /** Logger; defaults to the shared singleton. */
  logger?: LoggingService;
}

/** Default VS Code confirmation for consult-mode commands. */
export class VscodeSquadConsultModeConfirmer implements SquadConsultModeConfirmer {
  public async confirm(request: SquadConsultModeConfirmationRequest): Promise<boolean> {
    const label = request.operation === SquadConsultModeOperation.Consult ? "Start Consult Mode" : "Extract Learnings";
    const choice = await vscode.window.showWarningMessage(
      request.operation === SquadConsultModeOperation.Consult ? "Start Squad consult mode?" : "Extract Squad consult learnings?",
      {
        modal: true,
        detail: [
          request.warning,
          `Target: ${request.targetLabel}`,
          `Command: ${request.commandPreview.join(" ")}`,
          request.operation === SquadConsultModeOperation.Consult
            ? "NexKit backs up existing workspace Squad artifacts before running the command."
            : "NexKit backs up the workspace consult artifacts before running the command.",
        ].join("\n"),
      },
      label
    );
    return choice === label;
  }
}

/** VS Code workspace.fs-backed config reader. */
class VscodeSquadConsultModeFileSystem implements SquadConsultModeFileSystem {
  private readonly _decoder = new TextDecoder("utf-8");

  public async readFile(uri: vscode.Uri): Promise<string> {
    return this._decoder.decode(await vscode.workspace.fs.readFile(uri));
  }
}

/** Service for detecting and running Squad consult mode in the current workspace. */
export class SquadConsultModeService {
  private readonly _cli: SquadCliService;
  private readonly _personal: Pick<SquadPersonalSquadService, "getStatus">;
  private readonly _backup: SquadArtifactBackup;
  private readonly _detection: Pick<SquadDetectionService, "detect">;
  private readonly _confirmer: SquadConsultModeConfirmer;
  private readonly _fileSystem: SquadConsultModeFileSystem;
  private readonly _getWorkspaceRoot: () => vscode.Uri | undefined;
  private readonly _logger: LoggingService;

  constructor(options: SquadConsultModeServiceOptions) {
    this._cli = options.cli;
    this._personal = options.personal;
    this._backup = options.backup;
    this._detection = options.detection;
    this._confirmer = options.confirmer ?? new VscodeSquadConsultModeConfirmer();
    this._fileSystem = options.fileSystem ?? new VscodeSquadConsultModeFileSystem();
    this._getWorkspaceRoot = options.getWorkspaceRoot ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri);
    this._logger = options.logger ?? LoggingService.getInstance();
  }

  /** Read-only consult-mode detection. Missing config is a successful inactive state. */
  public async getStatus(): Promise<SquadResult<SquadConsultModeStatus>> {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return squadErr({
        code: "not-a-workspace",
        message: "Cannot inspect Squad consult mode without an open workspace folder.",
        remediation: "Open the workspace where you want to use consult mode, then retry.",
      });
    }

    const personalStatus = await this._personal.getStatus();
    if (isSquadErr(personalStatus)) {
      return personalStatus;
    }

    const consultFlag = await this._readConsultFlag(workspaceRoot);
    if (isSquadErr(consultFlag)) {
      return consultFlag;
    }

    return squadOk(this._buildStatus(consultFlag.value, personalStatus.value));
  }

  /**
   * Run `squad consult` after confirming scope, checking personal Squad state
   * and backing up workspace Squad artifacts.
   */
  public async startConsultMode(): Promise<SquadResult<SquadConsultModeOutcome>> {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return this._notWorkspace();
    }

    const current = await this.getStatus();
    if (isSquadErr(current)) {
      return current;
    }
    if (current.value.personalStatus.state !== SquadPersonalSquadState.Initialized) {
      return this._personalNotInitialized("start consult mode");
    }
    if (current.value.state === SquadConsultModeState.Active) {
      return squadOk({
        operation: SquadConsultModeOperation.Consult,
        status: current.value,
        alreadyActive: true,
        backupPath: null,
        detection: await this._safeDetect(workspaceRoot),
      });
    }

    const confirmed = await this._confirm(
      SquadConsultModeOperation.Consult,
      CONSULT_TARGET_LABEL,
      ["squad", "consult"],
      CONSULT_MODE_SCOPE_WARNING
    );
    if (!confirmed) {
      return this._cancelled(SquadConsultModeOperation.Consult);
    }

    const backupPath = await this._backupWorkspace(workspaceRoot, SquadConsultModeOperation.Consult);
    if (isSquadErr(backupPath)) {
      return backupPath;
    }

    const execution = await this._cli.execute(SquadCliCommand.Consult, {
      cwd: workspaceRoot,
      args: ["--yes"],
    });
    if (isSquadErr(execution)) {
      return execution;
    }

    const refreshed = await this.getStatus();
    if (isSquadErr(refreshed)) {
      return refreshed;
    }
    if (refreshed.value.state !== SquadConsultModeState.Active) {
      return squadErr({
        code: "cli-execution-failed",
        message: "Squad reported success, but NexKit could not find consult mode in .squad/config.json.",
        remediation: "Run `squad consult` from a terminal to inspect the CLI output, then refresh the Squad panel.",
        detail: CONSULT_CONFIG_RELATIVE_PATH,
      });
    }

    return squadOk({
      operation: SquadConsultModeOperation.Consult,
      status: refreshed.value,
      alreadyActive: false,
      backupPath: backupPath.value,
      detection: await this._safeDetect(workspaceRoot),
      stdout: execution.value.stdout,
      stderr: execution.value.stderr,
      durationMs: execution.value.durationMs,
    });
  }

  /**
   * Run `squad extract` after confirming the personal-scope merge target and
   * backing up the workspace consult artifacts.
   */
  public async extractLearnings(): Promise<SquadResult<SquadConsultModeOutcome>> {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return this._notWorkspace();
    }

    const current = await this.getStatus();
    if (isSquadErr(current)) {
      return current;
    }
    if (current.value.personalStatus.state !== SquadPersonalSquadState.Initialized) {
      return this._personalNotInitialized("extract consult learnings");
    }
    if (current.value.state !== SquadConsultModeState.Active) {
      return squadErr({
        code: "invalid-input",
        message: "This workspace is not in Squad consult mode.",
        remediation: "Run `squad consult` first, then extract learnings when consult work is ready to merge back.",
        detail: CONSULT_CONFIG_RELATIVE_PATH,
      });
    }

    const confirmed = await this._confirm(
      SquadConsultModeOperation.Extract,
      current.value.personalStatus.targetLabel,
      ["squad", "extract"],
      CONSULT_MODE_EXTRACT_WARNING
    );
    if (!confirmed) {
      return this._cancelled(SquadConsultModeOperation.Extract);
    }

    const backupPath = await this._backupWorkspace(workspaceRoot, SquadConsultModeOperation.Extract);
    if (isSquadErr(backupPath)) {
      return backupPath;
    }

    const execution = await this._cli.execute(SquadCliCommand.Extract, {
      cwd: workspaceRoot,
      args: ["--yes"],
    });
    if (isSquadErr(execution)) {
      return execution;
    }

    const refreshed = await this.getStatus();
    if (isSquadErr(refreshed)) {
      return refreshed;
    }

    return squadOk({
      operation: SquadConsultModeOperation.Extract,
      status: refreshed.value,
      backupPath: backupPath.value,
      detection: await this._safeDetect(workspaceRoot),
      stdout: execution.value.stdout,
      stderr: execution.value.stderr,
      durationMs: execution.value.durationMs,
    });
  }

  private async _readConsultFlag(workspaceRoot: vscode.Uri): Promise<SquadResult<boolean>> {
    const configUri = vscode.Uri.joinPath(workspaceRoot, ".squad", "config.json");
    let content: string;
    try {
      content = await this._fileSystem.readFile(configUri);
    } catch (error) {
      if (this._isNotFound(error)) {
        return squadOk(false);
      }
      this._logger.warn("Squad consult mode: config read failed", error);
      return squadErr({
        code: "file-read-failed",
        message: "NexKit could not read the Squad consult mode configuration.",
        remediation: "Check permissions for .squad/config.json, then retry.",
        detail: CONSULT_CONFIG_RELATIVE_PATH,
        cause: error,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return squadErr({
        code: "parse-failed",
        message: "The Squad configuration (.squad/config.json) is not valid JSON.",
        remediation: "Fix the JSON syntax in .squad/config.json, then refresh consult mode status.",
        detail: CONSULT_CONFIG_RELATIVE_PATH,
        cause: error,
      });
    }

    if (!this._isRecord(parsed) || Array.isArray(parsed)) {
      return this._invalidConsultConfig("Expected .squad/config.json to be a JSON object.");
    }

    const consult = parsed.consult;
    if (consult === undefined) {
      return squadOk(false);
    }
    if (typeof consult !== "boolean") {
      return this._invalidConsultConfig('Expected .squad/config.json property "consult" to be a boolean.');
    }

    return squadOk(consult);
  }

  private async _backupWorkspace(
    workspaceRoot: vscode.Uri,
    operation: SquadConsultModeOperation
  ): Promise<SquadResult<string | null>> {
    try {
      return squadOk(await this._backup.backupSquadArtifacts(workspaceRoot.fsPath));
    } catch (error) {
      this._logger.error(`Squad consult mode: backup failed before ${operation}`, error);
      return squadErr({
        code: "backup-failed",
        message: `Could not back up workspace Squad files, so "${operation}" was aborted.`,
        remediation: "Ensure the backup location is writable and you have free disk space, then try again. Nothing was changed.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }
  }

  private async _confirm(
    operation: SquadConsultModeOperation,
    targetLabel: string,
    commandPreview: readonly string[],
    warning: string
  ): Promise<boolean> {
    return this._confirmer.confirm({
      operation,
      targetLabel,
      commandPreview,
      warning,
    });
  }

  private async _safeDetect(workspaceRoot: vscode.Uri): Promise<SquadDetectionResult | undefined> {
    const detection = await this._detection.detect(workspaceRoot);
    if (isSquadErr(detection)) {
      this._logger.warn("Squad consult mode: post-operation detection failed", detection.error);
      return undefined;
    }
    return detection.value;
  }

  private _buildStatus(active: boolean, personalStatus: SquadConsultModeStatus["personalStatus"]): SquadConsultModeStatus {
    return {
      state: active ? SquadConsultModeState.Active : SquadConsultModeState.Inactive,
      targetLabel: CONSULT_TARGET_LABEL,
      markerRelativePath: CONSULT_CONFIG_RELATIVE_PATH,
      warning: CONSULT_MODE_SCOPE_WARNING,
      excludedRelativePaths: [...CONSULT_EXCLUDED_RELATIVE_PATHS],
      personalStatus,
    };
  }

  private _notWorkspace(): SquadResult<never> {
    return squadErr({
      code: "not-a-workspace",
      message: "Cannot run Squad consult mode without an open workspace folder.",
      remediation: "Open the workspace where you want to use consult mode, then retry.",
    });
  }

  private _personalNotInitialized(action: string): SquadResult<never> {
    return squadErr({
      code: "invalid-input",
      message: `Cannot ${action} because the personal Squad is not initialized.`,
      remediation: "Initialize your personal Squad first, then retry consult mode.",
    });
  }

  private _cancelled(operation: SquadConsultModeOperation): SquadResult<never> {
    return squadErr({
      code: "cancelled",
      message: `Squad ${operation} was cancelled.`,
      remediation: "Run the action again when you are ready to proceed. Nothing was changed.",
    });
  }

  private _invalidConsultConfig(message: string): SquadResult<never> {
    return squadErr({
      code: "parse-failed",
      message: "The Squad configuration (.squad/config.json) has an unsupported consult mode shape.",
      remediation: 'Set "consult" to true or false, or remove the property, then refresh consult mode status.',
      detail: `${CONSULT_CONFIG_RELATIVE_PATH}: ${message}`,
    });
  }

  private _isNotFound(error: unknown): boolean {
    if (error instanceof vscode.FileSystemError) {
      return error.code === "FileNotFound";
    }
    return this._isRecord(error) && error.code === "FileNotFound";
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
