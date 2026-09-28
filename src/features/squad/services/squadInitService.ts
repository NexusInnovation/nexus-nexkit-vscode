/**
 * SquadInitService (SQD-020) — initialise Squad in the current workspace from a
 * selected preset, with a prior backup and full rollback on failure.
 *
 * Implements PRD FR-014 (combine the selected preset with `squad init`, never
 * silently overwriting an existing Squad) and FR-006 (back up existing Squad
 * artifacts via {@link GitHubTemplateBackupService} before any destructive
 * write). The flow, in order, is:
 *
 *  1. Resolve the workspace root (fail `not-a-workspace` when none is open).
 *  2. Discover the selected preset and re-download + re-validate its reserved
 *     `squad/` folder against the SQD-015 contract (never trust a stale pick).
 *  3. Verify every preset file resolves safely inside the workspace `.squad/`
 *     folder — any absolute path or `..` traversal aborts before touching disk.
 *  4. Ask for explicit user confirmation, listing exactly what will be written
 *     and whether existing Squad files will be backed up and replaced.
 *  5. Back up any existing `.squad/` and `.github/agents/squad.agent.md`
 *     BEFORE writing. A backup failure aborts before any write.
 *  6. Run `squad init` via the allowlisted {@link SquadCliService}.
 *  7. Write the preset files into `.squad/`.
 *  8. Roll back (restore the backup, or remove freshly-created artifacts) and
 *     report clearly on any init or write failure.
 *  9. Re-run detection so the panel can flip to the detected view.
 *
 * Every seam (preset provider, download service, CLI, backup, detection,
 * confirmation, file system, clock, workspace resolver) is injectable so the
 * flow is fully unit-testable without touching disk, the network, or the CLI.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import { fileExists } from "../../../shared/utils/fileHelper";
import { SquadCliCommand, SquadCliService } from "./squadCliService";
import { SquadDetectionService } from "./squadDetectionService";
import {
  SquadDetectionResult,
  SquadError,
  SquadPreset,
  SquadPresetProvider,
  SquadResult,
  isSquadErr,
  squadErr,
  squadOk,
} from "../models";
import { SquadPresetDownloadService } from "./squadPresetDownloadService";

/** What the user is asked to confirm before an initialisation runs. */
export interface SquadInitConfirmationRequest {
  /** The validated preset that will be applied. */
  preset: SquadPreset;

  /** Absolute workspace root the Squad will be initialised into. */
  workspaceRoot: string;

  /** Number of preset files that will be written under `.squad/`. */
  fileCount: number;

  /** `.squad/`-relative paths that will be written (for a detailed listing). */
  filePaths: string[];

  /** Whether existing Squad artifacts are present and will be backed up/replaced. */
  hasExistingSquad: boolean;

  /** Whether `squad init` will be run as part of the flow. */
  willRunCli: boolean;
}

/** Presents the confirmation dialog. Injectable so tests never open UI. */
export interface SquadInitConfirmer {
  /** Return `true` only when the user explicitly approved the initialisation. */
  confirm(request: SquadInitConfirmationRequest): Promise<boolean>;
}

/**
 * Backup seam for existing Squad artifacts. Structurally satisfied by
 * {@link GitHubTemplateBackupService} so production wiring reuses BackupService.
 */
export interface SquadArtifactBackup {
  /** Back up existing Squad artifacts; returns the backup path or `null`. */
  backupSquadArtifacts(workspaceRoot: string): Promise<string | null>;

  /** Restore Squad artifacts from a prior backup (rollback). */
  restoreSquadArtifacts(workspaceRoot: string, backupPath: string): Promise<void>;
}

/** Minimal file-system seam used for writing preset files and rollback. */
export interface SquadInitFileSystem {
  /** Whether a path exists. */
  exists(absolutePath: string): Promise<boolean>;

  /** Write UTF-8 text, creating parent directories as needed. */
  writeFile(absolutePath: string, content: string): Promise<void>;

  /** Recursively remove a path (best-effort, no error when absent). */
  removePath(absolutePath: string): Promise<void>;
}

/** Successful outcome of an initialisation. */
export interface SquadInitOutcome {
  /** The preset id that was initialised. */
  presetId: string;

  /** Fresh detection result after init, so the panel can flip to the detected view. */
  detection?: SquadDetectionResult;

  /** Path of the backup taken before writing, or `null` when nothing existed. */
  backupPath: string | null;

  /** Number of preset files written under `.squad/`. */
  writtenFileCount: number;
}

/** Constructor dependencies. Core services are required; seams have defaults. */
export interface SquadInitServiceOptions {
  /** Aggregated preset provider used to resolve the selected preset. */
  presetProvider: SquadPresetProvider;

  /** Downloads + re-validates the preset's `squad/` folder (SQD-015). */
  downloadService: SquadPresetDownloadService;

  /** Allowlisted Squad CLI wrapper used to run `squad init`. */
  cli: SquadCliService;

  /** Backup service for existing Squad artifacts (FR-006). */
  backup: SquadArtifactBackup;

  /** Detection service, re-run after a successful init. */
  detection: SquadDetectionService;

  /** Confirmation dialog seam; defaults to a VS Code modal. */
  confirmer?: SquadInitConfirmer;

  /** File-system seam; defaults to a Node `fs` implementation. */
  fileSystem?: SquadInitFileSystem;

  /** Logger; defaults to the shared {@link LoggingService} singleton. */
  logger?: LoggingService;

  /** Workspace-root resolver; defaults to the first open workspace folder. */
  getWorkspaceRoot?: () => string | undefined;

  /** Whether to run `squad init` (FR-014). Defaults to `true`. */
  runCliInit?: boolean;
}

/** Modal-dialog confirmation used in production. */
export class VscodeSquadInitConfirmer implements SquadInitConfirmer {
  public async confirm(request: SquadInitConfirmationRequest): Promise<boolean> {
    const lines = [
      `Preset: ${request.preset.name}`,
      request.willRunCli ? "• Run `squad init` in this workspace." : "",
      `• Write ${request.fileCount} preset file(s) into .squad/.`,
      request.hasExistingSquad
        ? "• Your existing .squad/ and .github/agents/squad.agent.md will be backed up first, then replaced."
        : "• No existing Squad was detected; nothing will be overwritten.",
    ].filter((line) => line.length > 0);

    const choice = await vscode.window.showWarningMessage(
      "Initialise Squad from this preset?",
      { modal: true, detail: lines.join("\n") },
      "Initialise"
    );
    return choice === "Initialise";
  }
}

/** Default Node `fs`-backed file system. */
class NodeSquadInitFileSystem implements SquadInitFileSystem {
  public async exists(absolutePath: string): Promise<boolean> {
    return fileExists(absolutePath);
  }

  public async writeFile(absolutePath: string, content: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, content, "utf8");
  }

  public async removePath(absolutePath: string): Promise<void> {
    await fs.promises.rm(absolutePath, { recursive: true, force: true });
  }
}

/** Relative artifacts removed when rolling back a fresh (un-backed-up) init. */
const FRESH_INIT_ARTIFACTS: readonly string[] = [".squad", path.join(".github", "agents", "squad.agent.md")];

/**
 * Initialises Squad from a preset with a prior backup and rollback on failure.
 */
export class SquadInitService {
  private readonly _presetProvider: SquadPresetProvider;
  private readonly _downloadService: SquadPresetDownloadService;
  private readonly _cli: SquadCliService;
  private readonly _backup: SquadArtifactBackup;
  private readonly _detection: SquadDetectionService;
  private readonly _confirmer: SquadInitConfirmer;
  private readonly _fileSystem: SquadInitFileSystem;
  private readonly _logger: LoggingService;
  private readonly _getWorkspaceRoot: () => string | undefined;
  private readonly _runCliInit: boolean;

  constructor(options: SquadInitServiceOptions) {
    this._presetProvider = options.presetProvider;
    this._downloadService = options.downloadService;
    this._cli = options.cli;
    this._backup = options.backup;
    this._detection = options.detection;
    this._confirmer = options.confirmer ?? new VscodeSquadInitConfirmer();
    this._fileSystem = options.fileSystem ?? new NodeSquadInitFileSystem();
    this._logger = options.logger ?? LoggingService.getInstance();
    this._getWorkspaceRoot =
      options.getWorkspaceRoot ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    this._runCliInit = options.runCliInit ?? true;
  }

  /**
   * Initialise Squad in the current workspace from the preset identified by
   * {@link presetId}. Returns a {@link SquadResult}; the failure branch always
   * carries an actionable {@link SquadError} (including a `cancelled` error when
   * the user declines) so a failure never looks like a silent success.
   */
  public async initializeFromPreset(presetId: string): Promise<SquadResult<SquadInitOutcome>> {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return squadErr({
        code: "not-a-workspace",
        message: "Cannot initialise Squad without an open workspace folder.",
        remediation: "Open the folder you want to initialise Squad in, then try again.",
      });
    }

    // 1. Resolve + re-validate the selected preset (SQD-015).
    const presetResult = await this._resolvePreset(presetId);
    if (isSquadErr(presetResult)) {
      return presetResult;
    }
    const preset = presetResult.value;

    const downloadResult = await this._downloadService.downloadPreset(preset.source);
    if (isSquadErr(downloadResult)) {
      this._logger.warn("Squad init: preset re-validation failed", downloadResult.error);
      return downloadResult;
    }
    const files = downloadResult.value.files;

    // 2. Resolve safe write targets before touching disk (path-traversal guard).
    const squadDir = path.join(workspaceRoot, ".squad");
    const targetsResult = this._resolveWriteTargets(squadDir, files);
    if (isSquadErr(targetsResult)) {
      this._logger.warn("Squad init: rejected unsafe preset path", targetsResult.error);
      return targetsResult;
    }
    const targets = targetsResult.value;

    // 3. Explicit user confirmation listing what will be written.
    const hasExistingSquad = await this._hasExistingSquad(workspaceRoot);
    const confirmed = await this._confirmer.confirm({
      preset,
      workspaceRoot,
      fileCount: targets.length,
      filePaths: targets.map((t) => t.relativePath),
      hasExistingSquad,
      willRunCli: this._runCliInit,
    });
    if (!confirmed) {
      return squadErr({
        code: "cancelled",
        message: "Squad initialisation was cancelled.",
        remediation: "Run the initialisation again when you are ready to proceed.",
      });
    }

    // 4. Back up existing artifacts BEFORE any write. A backup failure aborts.
    let backupPath: string | null;
    try {
      backupPath = await this._backup.backupSquadArtifacts(workspaceRoot);
    } catch (error) {
      this._logger.error("Squad init: backup failed, aborting before any write", error);
      return squadErr({
        code: "backup-failed",
        message: "Could not back up your existing Squad files, so initialisation was aborted.",
        remediation:
          "Ensure the backup location is writable and you have free disk space, then try again. Nothing was changed.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }

    // 5. Run `squad init`, then write the preset files, rolling back on failure.
    if (this._runCliInit) {
      const cliResult = await this._cli.execute(SquadCliCommand.Init, {
        cwd: vscode.Uri.file(workspaceRoot),
        args: ["--yes"],
      });
      if (isSquadErr(cliResult)) {
        await this._rollback(workspaceRoot, backupPath, []);
        this._logger.warn("Squad init: `squad init` failed, rolled back", cliResult.error);
        return cliResult;
      }
    }

    const written: string[] = [];
    for (const target of targets) {
      try {
        await this._fileSystem.writeFile(target.absolutePath, files.get(target.relativePath) ?? "");
        written.push(target.absolutePath);
      } catch (error) {
        await this._rollback(workspaceRoot, backupPath, written);
        this._logger.error("Squad init: writing preset files failed, rolled back", error);
        return squadErr({
          code: "file-write-failed",
          message: `Failed to write preset file "${target.relativePath}"; the initialisation was rolled back.`,
          remediation:
            "Check file permissions and available disk space, then try initialising again. Your previous Squad files were restored.",
          detail: error instanceof Error ? error.message : String(error),
          cause: error,
        });
      }
    }

    // 6. Re-run detection so the panel can flip to the detected view.
    const detection = await this._safeDetect(workspaceRoot);

    this._logger.info("Squad init: initialised from preset", {
      presetId,
      fileCount: written.length,
      backedUp: backupPath !== null,
    });

    return squadOk({
      presetId,
      ...(detection ? { detection } : {}),
      backupPath,
      writtenFileCount: written.length,
    });
  }

  /** Discover presets and resolve the one matching {@link presetId}. */
  private async _resolvePreset(presetId: string): Promise<SquadResult<SquadPreset>> {
    const discovery = await this._presetProvider.discoverPresets();
    if (isSquadErr(discovery)) {
      return discovery;
    }

    const preset = discovery.value.presets.find((candidate) => candidate.id === presetId);
    if (!preset) {
      return squadErr({
        code: "preset-invalid",
        message: `The selected preset "${presetId}" is no longer available.`,
        remediation: "Refresh the preset list and choose an available preset.",
      });
    }

    return squadOk(preset);
  }

  /**
   * Resolve each preset file to an absolute target under `.squad/`, rejecting
   * any path that escapes the folder (absolute paths, `..` traversal).
   */
  private _resolveWriteTargets(
    squadDir: string,
    files: Map<string, string>
  ): SquadResult<{ relativePath: string; absolutePath: string }[]> {
    const targets: { relativePath: string; absolutePath: string }[] = [];
    for (const relativePath of files.keys()) {
      const normalized = relativePath.replace(/\\/g, "/");
      const absolutePath = path.resolve(squadDir, normalized);
      const relativeToSquad = path.relative(squadDir, absolutePath);

      const escapes =
        normalized.length === 0 ||
        relativeToSquad === "" ||
        relativeToSquad === ".." ||
        relativeToSquad.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeToSquad);

      if (escapes) {
        return squadErr({
          code: "preset-invalid",
          message: `Preset file "${relativePath}" resolves outside the workspace .squad/ folder and was rejected.`,
          remediation:
            "This preset contains an unsafe path and cannot be applied. Report it to the preset author.",
        });
      }

      targets.push({ relativePath: normalized, absolutePath });
    }
    return squadOk(targets);
  }

  /** Whether any Squad artifact already exists in the workspace. */
  private async _hasExistingSquad(workspaceRoot: string): Promise<boolean> {
    for (const relative of FRESH_INIT_ARTIFACTS) {
      if (await this._fileSystem.exists(path.join(workspaceRoot, relative))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Restore the pre-init state after a failure: remove any files we wrote, then
   * either restore the backup or remove the artifacts a fresh init created.
   */
  private async _rollback(
    workspaceRoot: string,
    backupPath: string | null,
    written: string[]
  ): Promise<void> {
    for (const absolutePath of written) {
      try {
        await this._fileSystem.removePath(absolutePath);
      } catch (error) {
        this._logger.warn("Squad init: failed to remove a written file during rollback", error);
      }
    }

    try {
      if (backupPath) {
        await this._backup.restoreSquadArtifacts(workspaceRoot, backupPath);
      } else {
        for (const relative of FRESH_INIT_ARTIFACTS) {
          await this._fileSystem.removePath(path.join(workspaceRoot, relative));
        }
      }
    } catch (error) {
      this._logger.error("Squad init: rollback encountered an error", error);
    }
  }

  /** Re-run detection, degrading to `undefined` on failure (never throws). */
  private async _safeDetect(workspaceRoot: string): Promise<SquadDetectionResult | undefined> {
    try {
      const result = await this._detection.detect(vscode.Uri.file(workspaceRoot));
      if (isSquadErr(result)) {
        this._logger.warn("Squad init: post-init detection failed", result.error);
        return undefined;
      }
      return result.value;
    } catch (error) {
      this._logger.warn("Squad init: post-init detection threw", error);
      return undefined;
    }
  }
}
