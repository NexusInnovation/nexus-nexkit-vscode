/**
 * Personal Squad support (SQD-051 / FR-064).
 *
 * The personal Squad is initialized with `squad init --global` and writes
 * outside the current workspace. This service keeps that contract explicit:
 * detection is read-only, initialization asks for confirmation, the CLI is
 * still routed through the allowlisted SquadCliService, and every failure
 * returns a structured SquadResult.
 */

import * as os from "os";
import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  PERSONAL_SQUAD_SCOPE_WARNING,
  SquadPersonalSquadScope,
  SquadPersonalSquadState,
  type SquadPersonalSquadInitOutcome,
  type SquadPersonalSquadStatus,
  type SquadResult,
  squadErr,
  squadOk,
} from "../models";
import { SquadCliCommand, SquadCliService } from "./squadCliService";
import { SquadFileService } from "./squadFileService";

const PERSONAL_SQUAD_MARKER_RELATIVE_PATH = ".squad/team.md";
const PERSONAL_SQUAD_TARGET_LABEL = "your user profile (.squad/)";

/** Request shown before running `squad init --global`. */
export interface SquadPersonalSquadConfirmationRequest {
  /** Scope the command will modify. */
  scope: SquadPersonalSquadScope;

  /** Human-readable target that avoids exposing absolute paths in webview state. */
  targetLabel: string;

  /** CLI command that will run. */
  commandPreview: readonly string[];

  /** Warning that this is not a workspace-local operation. */
  warning: string;
}

/** Confirmation seam so tests never show VS Code UI. */
export interface SquadPersonalSquadConfirmer {
  /** Return true only when the user explicitly approves the global init. */
  confirm(request: SquadPersonalSquadConfirmationRequest): Promise<boolean>;
}

/** Minimal file-system seam used for marker detection. */
export interface SquadPersonalSquadFileSystem {
  /** Whether a marker exists. Non-not-found errors should reject. */
  exists(uri: vscode.Uri): Promise<boolean>;
}

/** File-service factory seam; reuses SQD-011 parsing without tying tests to disk. */
export type SquadPersonalSquadFileServiceFactory = (root: vscode.Uri) => Pick<SquadFileService, "readRoster">;

/** Constructor seams for deterministic tests. */
export interface SquadPersonalSquadServiceOptions {
  /** Allowlisted CLI wrapper used to run `squad init --global`. */
  cli: SquadCliService;

  /** Confirmation UI seam. */
  confirmer?: SquadPersonalSquadConfirmer;

  /** Marker file-system seam. */
  fileSystem?: SquadPersonalSquadFileSystem;

  /** Factory for read-only `.squad/` access rooted at the personal directory. */
  createFileService?: SquadPersonalSquadFileServiceFactory;

  /** Resolves the personal Squad root; defaults to the OS home directory. */
  getPersonalRoot?: () => vscode.Uri | undefined;

  /** Logger; defaults to the shared singleton. */
  logger?: LoggingService;
}

/** Default VS Code confirmation for the global personal-Squad init command. */
export class VscodeSquadPersonalSquadConfirmer implements SquadPersonalSquadConfirmer {
  public async confirm(request: SquadPersonalSquadConfirmationRequest): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
      "Initialize your personal Squad?",
      {
        modal: true,
        detail: [
          request.warning,
          `Target: ${request.targetLabel}`,
          `Command: ${request.commandPreview.join(" ")}`,
          "Choose workspace Squad initialization instead if this should only affect the current repository.",
        ].join("\n"),
      },
      "Initialize Personal Squad"
    );
    return choice === "Initialize Personal Squad";
  }
}

/** VS Code workspace.fs-backed marker existence check. */
class VscodeSquadPersonalSquadFileSystem implements SquadPersonalSquadFileSystem {
  public async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch (error) {
      if (this._isNotFound(error)) {
        return false;
      }
      throw error;
    }
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

/** Service for detecting and initializing the user's personal/global Squad. */
export class SquadPersonalSquadService {
  private readonly _cli: SquadCliService;
  private readonly _confirmer: SquadPersonalSquadConfirmer;
  private readonly _fileSystem: SquadPersonalSquadFileSystem;
  private readonly _createFileService: SquadPersonalSquadFileServiceFactory;
  private readonly _getPersonalRoot: () => vscode.Uri | undefined;
  private readonly _logger: LoggingService;

  constructor(options: SquadPersonalSquadServiceOptions) {
    this._cli = options.cli;
    this._confirmer = options.confirmer ?? new VscodeSquadPersonalSquadConfirmer();
    this._fileSystem = options.fileSystem ?? new VscodeSquadPersonalSquadFileSystem();
    this._createFileService = options.createFileService ?? ((root) => new SquadFileService(root));
    this._getPersonalRoot = options.getPersonalRoot ?? this._defaultPersonalRoot;
    this._logger = options.logger ?? LoggingService.getInstance();
  }

  /** Read-only personal Squad detection. Absence is a successful not-initialized state. */
  public async getStatus(): Promise<SquadResult<SquadPersonalSquadStatus>> {
    const root = this._getPersonalRoot();
    if (!root) {
      return squadErr({
        code: "invalid-input",
        message: "NexKit could not resolve the user profile folder for personal Squad.",
        remediation: "Verify your operating system user profile is available, then retry.",
      });
    }

    const markerUri = vscode.Uri.joinPath(root, ".squad", "team.md");
    let markerExists: boolean;
    try {
      markerExists = await this._fileSystem.exists(markerUri);
    } catch (error) {
      this._logger.warn("Personal Squad: marker detection failed", error);
      return squadErr({
        code: "file-read-failed",
        message: "NexKit could not check whether a personal Squad is initialized.",
        remediation: "Check permissions for your user profile Squad files, then retry.",
        detail: PERSONAL_SQUAD_MARKER_RELATIVE_PATH,
        cause: error,
      });
    }

    if (!markerExists) {
      return squadOk(this._buildStatus(SquadPersonalSquadState.NotInitialized, []));
    }

    const roster = await this._createFileService(root).readRoster();
    if (!roster.ok) {
      return roster;
    }

    return squadOk(this._buildStatus(SquadPersonalSquadState.Initialized, roster.value));
  }

  /**
   * Initialize the personal Squad with `squad init --global`.
   *
   * Already-initialized personal Squads are returned as success without running
   * the CLI. New initialization requires explicit confirmation, then rechecks
   * the marker so a successful CLI exit cannot masquerade as initialized state.
   */
  public async initialize(): Promise<SquadResult<SquadPersonalSquadInitOutcome>> {
    const current = await this.getStatus();
    if (!current.ok) {
      return current;
    }

    if (current.value.state === SquadPersonalSquadState.Initialized) {
      return squadOk({ status: current.value, alreadyInitialized: true });
    }

    const confirmed = await this._confirmer.confirm({
      scope: SquadPersonalSquadScope.Personal,
      targetLabel: PERSONAL_SQUAD_TARGET_LABEL,
      commandPreview: ["squad", "init", "--global"],
      warning: PERSONAL_SQUAD_SCOPE_WARNING,
    });
    if (!confirmed) {
      return squadErr({
        code: "cancelled",
        message: "Personal Squad initialization was cancelled.",
        remediation: "Run the personal Squad initialization again when you are ready to update your user profile.",
      });
    }

    const execution = await this._cli.execute(SquadCliCommand.Init, {
      args: ["--global", "--yes"],
    });
    if (!execution.ok) {
      return execution;
    }

    const refreshed = await this.getStatus();
    if (!refreshed.ok) {
      return refreshed;
    }

    if (refreshed.value.state !== SquadPersonalSquadState.Initialized) {
      return squadErr({
        code: "cli-execution-failed",
        message: "Squad reported success, but NexKit could not find the personal Squad marker.",
        remediation:
          "Run `squad init --global` from a terminal to inspect the CLI output, then refresh the Squad panel.",
        detail: PERSONAL_SQUAD_MARKER_RELATIVE_PATH,
      });
    }

    return squadOk({
      status: refreshed.value,
      alreadyInitialized: false,
      stdout: execution.value.stdout,
      stderr: execution.value.stderr,
    });
  }

  private _defaultPersonalRoot(): vscode.Uri | undefined {
    const home = os.homedir();
    return home.trim().length > 0 ? vscode.Uri.file(home) : undefined;
  }

  private _buildStatus(
    state: SquadPersonalSquadState,
    roster: SquadPersonalSquadStatus["roster"]
  ): SquadPersonalSquadStatus {
    return {
      state,
      scope: SquadPersonalSquadScope.Personal,
      targetLabel: PERSONAL_SQUAD_TARGET_LABEL,
      markerRelativePath: PERSONAL_SQUAD_MARKER_RELATIVE_PATH,
      warning: PERSONAL_SQUAD_SCOPE_WARNING,
      roster,
      memberCount: roster.length,
    };
  }
}
