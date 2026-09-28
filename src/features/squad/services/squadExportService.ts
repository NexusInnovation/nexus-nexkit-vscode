/**
 * SquadExportService (SQD-033) — run `squad export` through the allowlisted
 * Squad CLI wrapper and expose a reusable file/GitHub transfer contract for
 * the follow-up import flow.
 */

import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SquadExportOutcome,
  SquadExportRequest,
  SquadFileTransferTarget,
  SquadGitHubTransferTarget,
  SquadResult,
  SquadTransferTarget,
  SquadTransferTargetKind,
  isSquadErr,
  squadErr,
  squadOk,
} from "../models";
import { SquadCliCommand, SquadCliService } from "./squadCliService";

/** Presents a save-file dialog. Injectable so unit tests never open UI. */
export interface SquadExportFilePicker {
  showSaveDialog(options: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined>;
}

/** Constructor dependencies for {@link SquadExportService}. */
export interface SquadExportServiceOptions {
  /** Allowlisted Squad CLI wrapper. */
  cli: SquadCliService;

  /** Logger; defaults to the shared {@link LoggingService} singleton. */
  logger?: LoggingService;

  /** Workspace-root resolver; defaults to the first open workspace folder. */
  getWorkspaceRoot?: () => vscode.Uri | undefined;

  /** File picker seam; defaults to `vscode.window`. */
  filePicker?: SquadExportFilePicker;

  /** Clock seam for deterministic tests. */
  now?: () => number;
}

/** Default file name offered when no target URI is supplied. */
const DEFAULT_EXPORT_FILE_NAME = "squad-export.json";

/**
 * Runs Squad exports to a chosen file or, when the CLI supports it, a GitHub
 * repository target. All failures are returned as actionable {@link SquadResult}
 * errors; success is only emitted after the CLI exits cleanly.
 */
export class SquadExportService {
  private readonly _cli: SquadCliService;
  private readonly _logger: LoggingService;
  private readonly _getWorkspaceRoot: () => vscode.Uri | undefined;
  private readonly _filePicker: SquadExportFilePicker;
  private readonly _now: () => number;

  constructor(options: SquadExportServiceOptions) {
    this._cli = options.cli;
    this._logger = options.logger ?? LoggingService.getInstance();
    this._getWorkspaceRoot =
      options.getWorkspaceRoot ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri);
    this._filePicker = options.filePicker ?? vscode.window;
    this._now = options.now ?? Date.now;
  }

  /** Export the current workspace's Squad state using the requested target. */
  public async exportSquad(
    request: SquadExportRequest = {}
  ): Promise<SquadResult<SquadExportOutcome>> {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return squadErr({
        code: "not-a-workspace",
        message: "Cannot export Squad without an open workspace folder.",
        remediation: "Open the workspace containing the Squad files, then try exporting again.",
      });
    }

    const targetResult = await this._resolveTarget(request.target, workspaceRoot);
    if (isSquadErr(targetResult)) {
      return targetResult;
    }

    const target = targetResult.value;
    const argsResult = this._buildArgs(target);
    if (isSquadErr(argsResult)) {
      return argsResult;
    }

    const execution = await this._cli.execute(SquadCliCommand.Export, {
      cwd: workspaceRoot,
      args: argsResult.value,
    });
    if (isSquadErr(execution)) {
      this._logger.warn("Squad export failed", execution.error);
      return execution;
    }

    this._logger.info("Squad export completed", {
      targetKind: target.kind,
      durationMs: execution.value.durationMs,
    });

    return squadOk({
      target,
      exportedAt: this._now(),
      stdout: execution.value.stdout,
      stderr: execution.value.stderr,
      durationMs: execution.value.durationMs,
    });
  }

  private async _resolveTarget(
    target: SquadTransferTarget | undefined,
    workspaceRoot: vscode.Uri
  ): Promise<SquadResult<SquadTransferTarget>> {
    if (!target || target.kind === SquadTransferTargetKind.File) {
      return this._resolveFileTarget(target, workspaceRoot);
    }

    return this._resolveGitHubTarget(target);
  }

  private async _resolveFileTarget(
    target: SquadFileTransferTarget | undefined,
    workspaceRoot: vscode.Uri
  ): Promise<SquadResult<SquadFileTransferTarget>> {
    if (target?.uri) {
      const uriResult = this._parseFileUri(target.uri);
      if (isSquadErr(uriResult)) {
        return uriResult;
      }
      return squadOk({ ...target, uri: uriResult.value.toString() });
    }

    const selected = await this._filePicker.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(workspaceRoot, target?.defaultFileName ?? DEFAULT_EXPORT_FILE_NAME),
      filters: {
        "Squad export": ["json"],
        "All files": ["*"],
      },
      saveLabel: "Export Squad",
      title: "Export Squad",
    });

    if (!selected) {
      return squadErr({
        code: "cancelled",
        message: "Squad export was cancelled.",
        remediation: "Run the export again when you are ready to choose a destination file.",
      });
    }

    return squadOk({
      kind: SquadTransferTargetKind.File,
      uri: selected.toString(),
      defaultFileName: target?.defaultFileName,
    });
  }

  private _resolveGitHubTarget(
    target: SquadGitHubTransferTarget
  ): SquadResult<SquadGitHubTransferTarget> {
    const repository = target.repository.trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      return squadErr({
        code: "cli-execution-failed",
        message: "The Squad export GitHub target must be in owner/repo form.",
        remediation: "Enter a GitHub repository such as `NexusInnovation/example-repo` and retry.",
      });
    }

    return squadOk({
      kind: SquadTransferTargetKind.GitHub,
      repository,
      ref: target.ref?.trim() || undefined,
      path: target.path?.trim() || undefined,
    });
  }

  private _buildArgs(target: SquadTransferTarget): SquadResult<string[]> {
    if (target.kind === SquadTransferTargetKind.File) {
      if (!target.uri) {
        return squadErr({
          code: "file-write-failed",
          message: "No Squad export file was selected.",
          remediation: "Choose a destination file, then run export again.",
        });
      }

      const uriResult = this._parseFileUri(target.uri);
      if (isSquadErr(uriResult)) {
        return uriResult;
      }

      return squadOk(["--output", uriResult.value.fsPath]);
    }

    const args = ["github", target.repository];
    if (target.ref) {
      args.push("--ref", target.ref);
    }
    if (target.path) {
      args.push("--path", target.path);
    }
    return squadOk(args);
  }

  private _parseFileUri(uri: string): SquadResult<vscode.Uri> {
    let parsed: vscode.Uri;
    try {
      parsed = vscode.Uri.parse(uri, true);
    } catch (error) {
      return squadErr({
        code: "file-write-failed",
        message: "The Squad export destination is not a valid file URI.",
        remediation: "Choose a local destination file and retry.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }

    if (parsed.scheme !== "file") {
      return squadErr({
        code: "file-write-failed",
        message: "Squad export currently requires a local file destination.",
        remediation: "Choose a local file path, or use a GitHub export target if your Squad CLI supports it.",
      });
    }

    return squadOk(parsed);
  }
}
