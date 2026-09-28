/**
 * SquadImportService (SQD-034, FR-062/FR-006) — preview a Squad export
 * manifest, then apply it through the allowlisted `squad import` CLI command
 * after explicit confirmation and a BackupService backup.
 *
 * Flow:
 * 1. `previewImport` reads the export (local file or GitHub repository) using
 *    the SQD-033 transfer contract, validates it with the same rules as the
 *    Squad CLI, computes every workspace path that will be created or
 *    overwritten, and stages the exact manifest content in memory.
 * 2. `applyImport` re-checks that the workspace still matches the preview,
 *    asks for confirmation, backs up every path the CLI may replace, writes the
 *    staged manifest to a private temp file and runs `squad import <file>
 *    --force`. A CLI failure rolls the workspace back to the backup.
 *
 * Staging the previewed content guarantees that what is applied is exactly
 * what was previewed, and removes the CLI's `gh` dependency for GitHub sources.
 */

import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import { GitHubAuthHelper } from "../../../shared/utils/githubAuthHelper";
import type { GitHubFetchFn } from "../../../shared/utils/githubRecursiveDownloader";
import {
  SquadError,
  SquadFileTransferTarget,
  SquadGitHubTransferTarget,
  SquadImportAgentPreview,
  SquadImportApplyRequest,
  SquadImportChangeKind,
  SquadImportFileChange,
  SquadImportOutcome,
  SquadImportPreview,
  SquadImportPreviewRequest,
  SquadImportSkillPreview,
  SquadResult,
  SquadTransferTarget,
  SquadTransferTargetKind,
  isSquadErr,
  squadErr,
  squadOk,
} from "../models";
import { SquadCliCommand, SquadCliService } from "./squadCliService";

/** Manifest format version accepted by `squad import`. */
export const SQUAD_EXPORT_MANIFEST_VERSION = "1.0";

/** Default repository path of a Squad export bundle. */
export const DEFAULT_SQUAD_IMPORT_REPO_PATH = "squad-export.json";

/** Largest export manifest NexKit will preview (bytes of UTF-8 text). */
export const MAX_SQUAD_IMPORT_BYTES = 10 * 1024 * 1024;

/** How long a staged preview stays applicable. */
const DEFAULT_PREVIEW_TTL_MS = 30 * 60 * 1000;

const SQUAD_DIR = ".squad";
const LEGACY_SQUAD_DIR = ".ai-team";
const SKILLS_DIR_SEGMENTS = [".copilot", "skills"] as const;
const BACKUP_LABEL = "squad-import";

/** Opens a file picker. Injectable so unit tests never open UI. */
export interface SquadImportFilePicker {
  showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined>;
}

/** Explicit confirmation before a destructive import. */
export interface SquadImportConfirmer {
  confirm(preview: SquadImportPreview): Promise<boolean>;
}

/** BackupService seam; structurally satisfied by `GitHubTemplateBackupService`. */
export interface SquadImportBackup {
  backupWorkspaceArtifacts(workspaceRoot: string, relativePaths: readonly string[], label: string): Promise<string | null>;
  restoreWorkspaceArtifacts(workspaceRoot: string, backupPath: string, relativePaths: readonly string[]): Promise<void>;
}

/** Kind of an on-disk path. */
export type SquadImportPathKind = "file" | "directory" | "missing";

/** File-system seam for deterministic unit tests. */
export interface SquadImportFileSystem {
  /** Read a UTF-8 text file; throws when unreadable. */
  readTextFile(absolutePath: string): Promise<string>;

  /** Byte size of a file; throws when missing. */
  fileSize(absolutePath: string): Promise<number>;

  /** Classify a path without throwing for missing entries. */
  pathKind(absolutePath: string): Promise<SquadImportPathKind>;

  /** List subdirectory names in a directory; empty when missing. */
  listDirectory(absolutePath: string): Promise<string[]>;

  /** Create a private temporary directory and return its absolute path. */
  makeTempDirectory(prefix: string): Promise<string>;

  /** Write a UTF-8 text file (parent must exist). */
  writeTextFile(absolutePath: string, content: string): Promise<void>;

  /** Remove a file or directory recursively; no-op when missing. */
  removePath(absolutePath: string): Promise<void>;
}

/** Constructor dependencies for {@link SquadImportService}. */
export interface SquadImportServiceOptions {
  /** Allowlisted Squad CLI wrapper. */
  cli: SquadCliService;

  /** Backup seam used before any import write (FR-006). */
  backup: SquadImportBackup;

  /** Logger; defaults to the shared {@link LoggingService} singleton. */
  logger?: LoggingService;

  /** Workspace-root resolver; defaults to the first open workspace folder. */
  getWorkspaceRoot?: () => vscode.Uri | undefined;

  /** File picker seam; defaults to `vscode.window`. */
  filePicker?: SquadImportFilePicker;

  /** Confirmation seam; defaults to a VS Code modal. */
  confirmer?: SquadImportConfirmer;

  /** File-system seam; defaults to Node `fs`. */
  fileSystem?: SquadImportFileSystem;

  /** `fetch`-compatible function for GitHub sources; defaults to global `fetch`. */
  fetchFn?: GitHubFetchFn;

  /** GitHub request headers provider; defaults to {@link GitHubAuthHelper}. */
  getGitHubHeaders?: () => Promise<Record<string, string>>;

  /** Clock seam for deterministic tests. */
  now?: () => number;

  /** Preview-id generator seam. */
  createId?: () => string;

  /** Preview validity window in milliseconds. */
  previewTtlMs?: number;
}

/** Validated subset of a `squad export` manifest. */
interface SquadExportManifest {
  version: string;
  exportedAt?: string;
  squadVersion?: string;
  hasRouting: boolean;
  casting: Record<string, unknown>;
  agents: { name: string; hasCharter: boolean; hasHistory: boolean }[];
  skills: string[];
}

/** Workspace impact of applying a manifest. */
interface SquadImportPlan {
  squadDirectory: string;
  hasExistingSquad: boolean;
  agents: SquadImportAgentPreview[];
  skills: SquadImportSkillPreview[];
  castingKeys: string[];
  files: SquadImportFileChange[];
  existingAgentNames: string[];
  /** Workspace-relative (OS-native) paths the import may replace; backed up first. */
  touchedPaths: string[];
}

/** Preview staged in memory until applied. */
interface StagedImport {
  preview: SquadImportPreview;
  content: string;
  workspaceRoot: string;
  stagingName: string;
  expiresAt: number;
}

/** Validate a slug the same way the Squad CLI does before writing it to disk. */
function isSafeSlug(name: string): boolean {
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return false;
  }
  if (name.startsWith(".") || name.startsWith("-")) {
    return false;
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

/** Mirror the Squad CLI's skill folder naming so the preview matches the import. */
function resolveSkillName(skills: string[], content: string): string {
  const fallback = `skill-${skills.indexOf(content)}`;
  const nameMatch = content.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  let skillName = nameMatch ? nameMatch[1].trim().toLowerCase().replace(/\s+/g, "-") : fallback;
  skillName = skillName.replace(/[^a-z0-9._-]/g, "-").replace(/^[.-]+/, "");
  return skillName && isSafeSlug(skillName) ? skillName : fallback;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Modal-dialog confirmation used in production. */
export class VscodeSquadImportConfirmer implements SquadImportConfirmer {
  public async confirm(preview: SquadImportPreview): Promise<boolean> {
    const overwrites = preview.files.filter((file) => file.change === SquadImportChangeKind.Overwrite).length;
    const lines = [
      `Source: ${preview.sourceLabel}`,
      `• ${preview.agents.length} agent(s) and ${preview.skills.length} skill(s); ${preview.files.length} file(s) written, ${overwrites} replaced.`,
      preview.hasExistingSquad
        ? `• Your existing ${preview.squadDirectory}/ will be backed up by NexKit, then archived and replaced by the Squad CLI.`
        : "• No existing Squad was detected.",
      ...preview.warnings.map((warning) => `• ${warning}`),
    ];

    const choice = await vscode.window.showWarningMessage(
      "Import this Squad into the workspace?",
      { modal: true, detail: lines.join("\n") },
      "Import"
    );
    return choice === "Import";
  }
}

/** Default Node `fs`-backed file system. */
class NodeSquadImportFileSystem implements SquadImportFileSystem {
  public async readTextFile(absolutePath: string): Promise<string> {
    return fs.promises.readFile(absolutePath, "utf8");
  }

  public async fileSize(absolutePath: string): Promise<number> {
    return (await fs.promises.stat(absolutePath)).size;
  }

  public async pathKind(absolutePath: string): Promise<SquadImportPathKind> {
    try {
      const stats = await fs.promises.stat(absolutePath);
      return stats.isDirectory() ? "directory" : "file";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return "missing";
      }
      throw error;
    }
  }

  public async listDirectory(absolutePath: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  public async makeTempDirectory(prefix: string): Promise<string> {
    return fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  }

  public async writeTextFile(absolutePath: string, content: string): Promise<void> {
    await fs.promises.writeFile(absolutePath, content, { encoding: "utf8", mode: 0o600 });
  }

  public async removePath(absolutePath: string): Promise<void> {
    await fs.promises.rm(absolutePath, { recursive: true, force: true });
  }
}

/**
 * Previews and applies Squad imports. Every failure is returned as an
 * actionable {@link SquadResult} error; success is only emitted after the CLI
 * exits cleanly.
 */
export class SquadImportService {
  private readonly _cli: SquadCliService;
  private readonly _backup: SquadImportBackup;
  private readonly _logger: LoggingService;
  private readonly _getWorkspaceRoot: () => vscode.Uri | undefined;
  private readonly _filePicker: SquadImportFilePicker;
  private readonly _confirmer: SquadImportConfirmer;
  private readonly _fileSystem: SquadImportFileSystem;
  private readonly _fetch: GitHubFetchFn;
  private readonly _getGitHubHeaders: () => Promise<Record<string, string>>;
  private readonly _now: () => number;
  private readonly _createId: () => string;
  private readonly _previewTtlMs: number;
  private _staged: StagedImport | undefined;

  constructor(options: SquadImportServiceOptions) {
    this._cli = options.cli;
    this._backup = options.backup;
    this._logger = options.logger ?? LoggingService.getInstance();
    this._getWorkspaceRoot =
      options.getWorkspaceRoot ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri);
    this._filePicker = options.filePicker ?? vscode.window;
    this._confirmer = options.confirmer ?? new VscodeSquadImportConfirmer();
    this._fileSystem = options.fileSystem ?? new NodeSquadImportFileSystem();
    this._fetch = options.fetchFn ?? ((url, init) => fetch(url, init) as unknown as ReturnType<GitHubFetchFn>);
    this._getGitHubHeaders =
      options.getGitHubHeaders ?? (() => GitHubAuthHelper.getAuthHeaders(["repo"], "Nexkit-VSCode-Extension", false));
    this._now = options.now ?? Date.now;
    this._createId = options.createId ?? randomUUID;
    this._previewTtlMs = options.previewTtlMs ?? DEFAULT_PREVIEW_TTL_MS;
  }

  /**
   * Read and validate an export, and describe every change the import would
   * make. Nothing in the workspace is modified.
   */
  public async previewImport(request: SquadImportPreviewRequest = {}): Promise<SquadResult<SquadImportPreview>> {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return squadErr({
        code: "not-a-workspace",
        message: "Cannot import Squad without an open workspace folder.",
        remediation: "Open the workspace you want to import the Squad into, then try again.",
      });
    }
    const rootPath = workspaceRoot.fsPath;

    const sourceResult = await this._resolveSource(request.source, workspaceRoot);
    if (isSquadErr(sourceResult)) {
      return sourceResult;
    }
    const source = sourceResult.value;

    const contentResult = await this._readSource(source);
    if (isSquadErr(contentResult)) {
      this._logger.warn("Squad import: could not read the export", contentResult.error);
      return contentResult;
    }
    const content = contentResult.value;

    const manifestResult = this._parseManifest(content);
    if (isSquadErr(manifestResult)) {
      this._logger.warn("Squad import: rejected export manifest", manifestResult.error);
      return manifestResult;
    }
    const manifest = manifestResult.value;

    const planResult = await this._plan(rootPath, manifest);
    if (isSquadErr(planResult)) {
      return planResult;
    }
    const plan = planResult.value;

    const preview: SquadImportPreview = {
      previewId: this._createId(),
      source,
      sourceLabel: this._sourceLabel(source),
      manifestVersion: manifest.version,
      ...(manifest.exportedAt ? { exportedAt: manifest.exportedAt } : {}),
      ...(manifest.squadVersion ? { squadVersion: manifest.squadVersion } : {}),
      ...this._universe(manifest),
      squadDirectory: plan.squadDirectory,
      hasExistingSquad: plan.hasExistingSquad,
      agents: plan.agents,
      skills: plan.skills,
      castingKeys: plan.castingKeys,
      files: plan.files,
      warnings: this._warnings(manifest, plan),
      createdAt: this._now(),
    };

    this._staged = {
      preview,
      content,
      workspaceRoot: rootPath,
      stagingName: this._stagingName(source),
      expiresAt: preview.createdAt + this._previewTtlMs,
    };

    this._logger.info("Squad import: preview ready", {
      sourceKind: source.kind,
      agentCount: plan.agents.length,
      skillCount: plan.skills.length,
      hasExistingSquad: plan.hasExistingSquad,
    });

    return squadOk(preview);
  }

  /**
   * Apply a previously previewed import after confirmation and backup. The
   * staged manifest content (not a re-read of the source) is imported.
   */
  public async applyImport(request: SquadImportApplyRequest): Promise<SquadResult<SquadImportOutcome>> {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return squadErr({
        code: "not-a-workspace",
        message: "Cannot import Squad without an open workspace folder.",
        remediation: "Open the workspace you previewed the import for, then try again.",
      });
    }
    const rootPath = workspaceRoot.fsPath;

    const staged = this._staged;
    if (!staged || staged.preview.previewId !== request.previewId || staged.workspaceRoot !== rootPath) {
      return squadErr({
        code: "cancelled",
        message: "This Squad import preview is no longer available, so nothing was imported.",
        remediation: "Preview the import again, review the changes, then apply it.",
      });
    }
    if (this._now() > staged.expiresAt) {
      this._staged = undefined;
      return squadErr({
        code: "cancelled",
        message: "This Squad import preview has expired, so nothing was imported.",
        remediation: "Preview the import again, review the changes, then apply it.",
      });
    }

    const manifestResult = this._parseManifest(staged.content);
    if (isSquadErr(manifestResult)) {
      return manifestResult;
    }
    const planResult = await this._plan(rootPath, manifestResult.value);
    if (isSquadErr(planResult)) {
      return planResult;
    }
    const plan = planResult.value;
    if (!this._planMatchesPreview(plan, staged.preview)) {
      this._staged = undefined;
      return squadErr({
        code: "file-write-failed",
        message: "The workspace changed since the Squad import preview, so nothing was imported.",
        remediation: "Preview the import again to review the current changes, then apply it.",
      });
    }

    const confirmed = await this._confirmer.confirm(staged.preview);
    if (!confirmed) {
      return squadErr({
        code: "cancelled",
        message: "Squad import was cancelled. Nothing was changed.",
        remediation: "Apply the import again when you are ready to proceed.",
      });
    }

    let backupPath: string | null;
    try {
      backupPath = await this._backup.backupWorkspaceArtifacts(rootPath, plan.touchedPaths, BACKUP_LABEL);
    } catch (error) {
      this._logger.error("Squad import: backup failed, aborting before any write", error);
      return squadErr({
        code: "backup-failed",
        message: "Could not back up your existing Squad files, so the import was aborted.",
        remediation:
          "Ensure the backup location is writable and you have free disk space, then try again. Nothing was changed.",
        detail: errorDetail(error),
        cause: error,
      });
    }

    let tempDirectory: string | undefined;
    try {
      let stagedFile: string;
      try {
        tempDirectory = await this._fileSystem.makeTempDirectory("nexkit-squad-import-");
        stagedFile = path.join(tempDirectory, `${staged.stagingName}.json`);
        await this._fileSystem.writeTextFile(stagedFile, staged.content);
      } catch (error) {
        this._logger.error("Squad import: could not stage the export for the CLI", error);
        return squadErr({
          code: "file-write-failed",
          message: "Could not prepare the Squad export for import. Nothing was changed.",
          remediation: "Check that the system temporary folder is writable, then try again.",
          detail: errorDetail(error),
          cause: error,
        });
      }

      const execution = await this._cli.execute(SquadCliCommand.Import, {
        cwd: workspaceRoot,
        args: [stagedFile, "--force"],
      });
      if (isSquadErr(execution)) {
        const rolledBack = await this._rollback(rootPath, backupPath, plan.touchedPaths);
        this._logger.warn("Squad import: `squad import` failed", execution.error);
        return squadErr(this._withRollbackNote(execution.error, rolledBack, backupPath !== null));
      }

      this._staged = undefined;
      this._logger.info("Squad import completed", {
        sourceKind: staged.preview.source.kind,
        agentCount: plan.agents.length,
        skillCount: plan.skills.length,
        backedUp: backupPath !== null,
        durationMs: execution.value.durationMs,
      });

      return squadOk({
        previewId: staged.preview.previewId,
        source: staged.preview.source,
        importedAt: this._now(),
        agentCount: plan.agents.length,
        skillCount: plan.skills.length,
        backupCreated: backupPath !== null,
        stdout: execution.value.stdout,
        stderr: execution.value.stderr,
        durationMs: execution.value.durationMs,
      });
    } finally {
      if (tempDirectory) {
        try {
          await this._fileSystem.removePath(tempDirectory);
        } catch (error) {
          this._logger.warn("Squad import: could not remove the temporary staging folder", error);
        }
      }
    }
  }

  /** Drop any staged preview (e.g. when the user dismisses it). */
  public discardPreview(): void {
    this._staged = undefined;
  }

  // --- source resolution --------------------------------------------------

  private async _resolveSource(
    source: SquadTransferTarget | undefined,
    workspaceRoot: vscode.Uri
  ): Promise<SquadResult<SquadTransferTarget>> {
    if (source?.kind === SquadTransferTargetKind.GitHub) {
      return this._resolveGitHubSource(source);
    }
    return this._resolveFileSource(source, workspaceRoot);
  }

  private async _resolveFileSource(
    source: SquadFileTransferTarget | undefined,
    workspaceRoot: vscode.Uri
  ): Promise<SquadResult<SquadFileTransferTarget>> {
    if (source?.uri) {
      const uriResult = this._parseFileUri(source.uri);
      if (isSquadErr(uriResult)) {
        return uriResult;
      }
      return squadOk({ kind: SquadTransferTargetKind.File, uri: uriResult.value.toString() });
    }

    const selected = await this._filePicker.showOpenDialog({
      defaultUri: vscode.Uri.joinPath(workspaceRoot, source?.defaultFileName ?? DEFAULT_SQUAD_IMPORT_REPO_PATH),
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        "Squad export": ["json"],
        "All files": ["*"],
      },
      openLabel: "Preview import",
      title: "Import Squad",
    });

    const uri = selected?.[0];
    if (!uri) {
      return squadErr({
        code: "cancelled",
        message: "Squad import was cancelled.",
        remediation: "Run the import again when you are ready to choose an export file.",
      });
    }
    if (uri.scheme !== "file") {
      return this._nonLocalFileError();
    }

    return squadOk({ kind: SquadTransferTargetKind.File, uri: uri.toString() });
  }

  private _resolveGitHubSource(source: SquadGitHubTransferTarget): SquadResult<SquadGitHubTransferTarget> {
    const repository = source.repository.trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      return squadErr({
        code: "file-read-failed",
        message: "The Squad import GitHub source must be in owner/repo form.",
        remediation: "Enter a GitHub repository such as `NexusInnovation/example-repo` and retry.",
      });
    }

    const repoPath = (source.path?.trim() || DEFAULT_SQUAD_IMPORT_REPO_PATH).replace(/^\/+/, "");
    const segments = repoPath.split("/");
    if (repoPath.includes("\\") || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      return squadErr({
        code: "file-read-failed",
        message: "The Squad import GitHub path is not a valid repository file path.",
        remediation: `Use a repository-relative path such as \`${DEFAULT_SQUAD_IMPORT_REPO_PATH}\` and retry.`,
      });
    }

    const ref = source.ref?.trim();
    return squadOk({
      kind: SquadTransferTargetKind.GitHub,
      repository,
      path: repoPath,
      ...(ref ? { ref } : {}),
    });
  }

  private async _readSource(source: SquadTransferTarget): Promise<SquadResult<string>> {
    if (source.kind === SquadTransferTargetKind.GitHub) {
      return this._readGitHubSource(source);
    }

    const uriResult = this._parseFileUri(source.uri ?? "");
    if (isSquadErr(uriResult)) {
      return uriResult;
    }
    const filePath = uriResult.value.fsPath;

    try {
      const size = await this._fileSystem.fileSize(filePath);
      if (size > MAX_SQUAD_IMPORT_BYTES) {
        return this._tooLargeError();
      }
      return squadOk(await this._fileSystem.readTextFile(filePath));
    } catch (error) {
      return squadErr({
        code: "file-read-failed",
        message: "Could not read the selected Squad export file.",
        remediation: "Check that the file exists and is readable, then preview the import again.",
        detail: errorDetail(error),
        cause: error,
      });
    }
  }

  private async _readGitHubSource(source: SquadGitHubTransferTarget): Promise<SquadResult<string>> {
    const [owner, repo] = source.repository.split("/");
    const repoPath = source.path ?? DEFAULT_SQUAD_IMPORT_REPO_PATH;
    const encodedPath = repoPath.split("/").map(encodeURIComponent).join("/");
    const query = source.ref ? `?ref=${encodeURIComponent(source.ref)}` : "";
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${query}`;

    try {
      const headers = { ...(await this._getGitHubHeaders()), Accept: "application/vnd.github.raw+json" };
      const response = await this._fetch(url, { headers });
      if (!response.ok) {
        return squadErr(this._gitHubError(response.status, response.headers.get("x-ratelimit-remaining"), source));
      }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_SQUAD_IMPORT_BYTES) {
        return this._tooLargeError();
      }
      return squadOk(text);
    } catch (error) {
      return squadErr({
        code: "file-read-failed",
        message: `Could not download the Squad export from ${source.repository}.`,
        remediation: "Check your network connection and GitHub access, then preview the import again.",
        detail: errorDetail(error),
        cause: error,
      });
    }
  }

  private _gitHubError(status: number, rateLimitRemaining: string | null, source: SquadGitHubTransferTarget): SquadError {
    const location = `${source.repository}/${source.path ?? DEFAULT_SQUAD_IMPORT_REPO_PATH}${source.ref ? ` (ref: ${source.ref})` : ""}`;
    if (status === 403 && rateLimitRemaining === "0") {
      return {
        code: "file-read-failed",
        message: "GitHub API rate limit exceeded while downloading the Squad export.",
        remediation: "Sign in to GitHub in VS Code (or set GITHUB_TOKEN) and retry later.",
        detail: `HTTP ${status}`,
      };
    }
    if (status === 404) {
      return {
        code: "file-read-failed",
        message: `No Squad export was found at ${location}.`,
        remediation:
          "Verify the repository, ref and path exist and that you have access. Private repositories require GitHub authentication.",
        detail: `HTTP ${status}`,
      };
    }
    if (status === 401 || status === 403) {
      return {
        code: "file-read-failed",
        message: `Access to ${source.repository} was denied while downloading the Squad export.`,
        remediation: "Sign in to GitHub in VS Code (or set GITHUB_TOKEN) with access to this repository, then retry.",
        detail: `HTTP ${status}`,
      };
    }
    return {
      code: "file-read-failed",
      message: `GitHub returned an error while downloading the Squad export from ${location}.`,
      remediation: "Wait a moment and preview the import again.",
      detail: `HTTP ${status}`,
    };
  }

  private _parseFileUri(uri: string): SquadResult<vscode.Uri> {
    let parsed: vscode.Uri;
    try {
      parsed = vscode.Uri.parse(uri, true);
    } catch (error) {
      return squadErr({
        code: "file-read-failed",
        message: "The Squad import source is not a valid file URI.",
        remediation: "Choose a local Squad export file and retry.",
        detail: errorDetail(error),
        cause: error,
      });
    }
    if (parsed.scheme !== "file") {
      return this._nonLocalFileError();
    }
    return squadOk(parsed);
  }

  private _nonLocalFileError(): SquadResult<never> {
    return squadErr({
      code: "file-read-failed",
      message: "Squad import requires a local export file or a GitHub repository source.",
      remediation: "Choose a local `squad-export.json` file, or import from a GitHub repository.",
    });
  }

  private _tooLargeError(): SquadResult<never> {
    return squadErr({
      code: "parse-failed",
      message: "The Squad export is too large to preview safely.",
      remediation: `Use an export smaller than ${MAX_SQUAD_IMPORT_BYTES / (1024 * 1024)} MB, or trim agent histories before exporting.`,
    });
  }

  // --- manifest validation -------------------------------------------------

  /** Validate a manifest with the same rules `squad import` enforces (plus path safety). */
  private _parseManifest(content: string): SquadResult<SquadExportManifest> {
    const invalid = (message: string, detail?: string): SquadResult<never> =>
      squadErr({
        code: "parse-failed",
        message,
        remediation: "Choose a file produced by `squad export` (or NexKit's Export Squad), then preview again.",
        ...(detail ? { detail } : {}),
      });

    let raw: unknown;
    try {
      raw = JSON.parse(content.replace(/^\uFEFF/, ""));
    } catch (error) {
      return invalid("The Squad export is not valid JSON.", errorDetail(error));
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return invalid("The Squad export must be a JSON object.");
    }
    const manifest = raw as Record<string, unknown>;

    if (manifest.version !== SQUAD_EXPORT_MANIFEST_VERSION) {
      return invalid(
        `Unsupported Squad export version: ${typeof manifest.version === "string" ? manifest.version : "missing"} (expected ${SQUAD_EXPORT_MANIFEST_VERSION}).`
      );
    }
    if (!this._isPlainObject(manifest.agents)) {
      return invalid('The Squad export is missing a valid "agents" object.');
    }
    if (!this._isPlainObject(manifest.casting)) {
      return invalid('The Squad export is missing a valid "casting" object.');
    }
    if (!Array.isArray(manifest.skills) || manifest.skills.some((skill) => typeof skill !== "string")) {
      return invalid('The Squad export is missing a valid "skills" list.');
    }
    for (const field of ["decisions_md", "team_md", "routing_md", "decisions", "team"]) {
      if (manifest[field] !== undefined && typeof manifest[field] !== "string") {
        return invalid(`The Squad export field "${field}" must be text.`);
      }
    }

    const agents: SquadExportManifest["agents"] = [];
    for (const [name, value] of Object.entries(manifest.agents)) {
      if (!isSafeSlug(name)) {
        return invalid(`The Squad export contains an unsafe agent name "${name}".`);
      }
      if (!this._isPlainObject(value)) {
        return invalid(`The Squad export entry for agent "${name}" must be an object.`);
      }
      const charter = value.charter;
      const history = value.history;
      if ((charter !== undefined && typeof charter !== "string") || (history !== undefined && typeof history !== "string")) {
        return invalid(`The Squad export entry for agent "${name}" has non-text charter or history.`);
      }
      agents.push({ name, hasCharter: Boolean(charter), hasHistory: Boolean(history) });
    }

    for (const key of Object.keys(manifest.casting)) {
      if (!isSafeSlug(key)) {
        return invalid(`The Squad export contains an unsafe casting entry "${key}".`);
      }
    }

    return squadOk({
      version: manifest.version,
      ...(typeof manifest.exported_at === "string" ? { exportedAt: manifest.exported_at } : {}),
      ...(typeof manifest.squad_version === "string" ? { squadVersion: manifest.squad_version } : {}),
      hasRouting: manifest.routing_md !== undefined,
      casting: manifest.casting,
      agents,
      skills: manifest.skills as string[],
    });
  }

  private _isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  // --- workspace impact ------------------------------------------------------

  private async _plan(rootPath: string, manifest: SquadExportManifest): Promise<SquadResult<SquadImportPlan>> {
    try {
      const squadKind = await this._fileSystem.pathKind(path.join(rootPath, SQUAD_DIR));
      const legacyKind =
        squadKind === "missing" ? await this._fileSystem.pathKind(path.join(rootPath, LEGACY_SQUAD_DIR)) : "missing";
      const squadDirectory = squadKind === "missing" && legacyKind !== "missing" ? LEGACY_SQUAD_DIR : SQUAD_DIR;
      const hasExistingSquad = squadKind !== "missing" || legacyKind !== "missing";

      // The CLI falls back to the main checkout's Squad from a git worktree with
      // no local Squad, which would write outside this workspace without a backup.
      if (!hasExistingSquad && (await this._fileSystem.pathKind(path.join(rootPath, ".git"))) === "file") {
        return squadErr({
          code: "file-write-failed",
          message: "This workspace is a git worktree without its own Squad; the Squad CLI would import into the main checkout instead.",
          remediation: "Open the main checkout to import there, or initialise Squad in this worktree first, then preview again.",
        });
      }

      const files: SquadImportFileChange[] = [];
      const addFile = async (segments: string[]): Promise<void> => {
        const kind = await this._fileSystem.pathKind(path.join(rootPath, ...segments));
        files.push({
          relativePath: segments.join("/"),
          change: kind === "missing" ? SquadImportChangeKind.Create : SquadImportChangeKind.Overwrite,
        });
      };

      await addFile([squadDirectory, "decisions.md"]);
      await addFile([squadDirectory, "team.md"]);
      if (manifest.hasRouting) {
        await addFile([squadDirectory, "routing.md"]);
      }

      const castingKeys = Object.keys(manifest.casting);
      for (const key of castingKeys) {
        await addFile([squadDirectory, "casting", `${key}.json`]);
      }

      const agents: SquadImportAgentPreview[] = [];
      for (const agent of manifest.agents) {
        const agentKind = await this._fileSystem.pathKind(path.join(rootPath, squadDirectory, "agents", agent.name));
        agents.push({
          ...agent,
          change: agentKind === "missing" ? SquadImportChangeKind.Create : SquadImportChangeKind.Overwrite,
        });
        if (agent.hasCharter) {
          await addFile([squadDirectory, "agents", agent.name, "charter.md"]);
        }
        await addFile([squadDirectory, "agents", agent.name, "history.md"]);
      }

      const skills: SquadImportSkillPreview[] = [];
      const skillNames = new Set<string>();
      for (const content of manifest.skills) {
        const name = resolveSkillName(manifest.skills, content);
        const skillKind = await this._fileSystem.pathKind(path.join(rootPath, ...SKILLS_DIR_SEGMENTS, name));
        skills.push({
          name,
          change: skillKind === "missing" ? SquadImportChangeKind.Create : SquadImportChangeKind.Overwrite,
        });
        if (!skillNames.has(name)) {
          skillNames.add(name);
          await addFile([...SKILLS_DIR_SEGMENTS, name, "SKILL.md"]);
        }
      }

      const existingAgentNames = hasExistingSquad
        ? await this._fileSystem.listDirectory(path.join(rootPath, squadDirectory, "agents"))
        : [];

      return squadOk({
        squadDirectory,
        hasExistingSquad,
        agents,
        skills,
        castingKeys,
        files,
        existingAgentNames,
        touchedPaths: [squadDirectory, ...[...skillNames].map((name) => path.join(...SKILLS_DIR_SEGMENTS, name))],
      });
    } catch (error) {
      return squadErr({
        code: "file-read-failed",
        message: "Could not inspect the workspace to preview the Squad import.",
        remediation: "Check that the workspace folder is readable, then preview the import again.",
        detail: errorDetail(error),
        cause: error,
      });
    }
  }

  private _planMatchesPreview(plan: SquadImportPlan, preview: SquadImportPreview): boolean {
    const signature = (value: Pick<SquadImportPlan, "squadDirectory" | "hasExistingSquad" | "files">): string =>
      JSON.stringify([value.squadDirectory, value.hasExistingSquad, value.files]);
    return signature(plan) === signature(preview);
  }

  private _warnings(manifest: SquadExportManifest, plan: SquadImportPlan): string[] {
    const warnings: string[] = [];
    if (plan.hasExistingSquad) {
      warnings.push(
        `The existing ${plan.squadDirectory}/ will be archived by the Squad CLI (${plan.squadDirectory}-archive-<timestamp>) and replaced; NexKit backs it up first.`
      );
      const incoming = new Set(manifest.agents.map((agent) => agent.name));
      const dropped = plan.existingAgentNames.filter((name) => !incoming.has(name));
      if (dropped.length > 0) {
        warnings.push(`${dropped.length} current agent(s) are not in this export and will no longer be active: ${dropped.join(", ")}.`);
      }
    }
    const overwrittenSkills = plan.skills.filter((skill) => skill.change === SquadImportChangeKind.Overwrite);
    if (overwrittenSkills.length > 0) {
      warnings.push(
        `${overwrittenSkills.length} existing skill(s) in .copilot/skills/ will be overwritten: ${overwrittenSkills.map((skill) => skill.name).join(", ")}.`
      );
    }
    if (new Set(plan.skills.map((skill) => skill.name)).size !== plan.skills.length) {
      warnings.push("Some skills share the same name; the last one in the export wins.");
    }
    if (manifest.agents.some((agent) => agent.hasHistory)) {
      warnings.push("Agent histories may contain project-specific learnings from the source project; review them after import.");
    }
    return warnings;
  }

  private _universe(manifest: SquadExportManifest): { universe?: string } {
    const policy = manifest.casting.policy;
    if (this._isPlainObject(policy) && policy.universe !== undefined && policy.universe !== null) {
      return { universe: String(policy.universe) };
    }
    return {};
  }

  private _sourceLabel(source: SquadTransferTarget): string {
    if (source.kind === SquadTransferTargetKind.GitHub) {
      return source.repository;
    }
    return source.uri ? path.basename(vscode.Uri.parse(source.uri, true).fsPath) : DEFAULT_SQUAD_IMPORT_REPO_PATH;
  }

  /** Name for the staged temp file; the CLI uses it as the "Imported from" label. */
  private _stagingName(source: SquadTransferTarget): string {
    const base =
      source.kind === SquadTransferTargetKind.GitHub
        ? source.repository.replace("/", "-")
        : path.basename(vscode.Uri.parse(source.uri ?? "", true).fsPath).replace(/\.json$/i, "");
    const sanitized = base.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "");
    return sanitized || "squad-export";
  }

  // --- rollback -------------------------------------------------------------

  private async _rollback(rootPath: string, backupPath: string | null, touchedPaths: string[]): Promise<boolean> {
    try {
      if (backupPath) {
        await this._backup.restoreWorkspaceArtifacts(rootPath, backupPath, touchedPaths);
      } else {
        for (const relative of touchedPaths) {
          await this._fileSystem.removePath(path.join(rootPath, relative));
        }
      }
      return true;
    } catch (error) {
      this._logger.error("Squad import: rollback after a failed import did not complete", error);
      return false;
    }
  }

  private _withRollbackNote(error: SquadError, rolledBack: boolean, hadBackup: boolean): SquadError {
    const note = rolledBack
      ? hadBackup
        ? "Your previous Squad files were restored from the NexKit backup."
        : "Any partially imported files were removed."
      : hadBackup
        ? "Automatic rollback failed; restore your Squad files from the latest `squad-import-*` NexKit backup."
        : "Automatic cleanup failed; review the workspace for partially imported Squad files.";
    return {
      ...error,
      message: `Squad import failed. ${error.message}`,
      remediation: [error.remediation, note].filter(Boolean).join(" "),
    };
  }
}
