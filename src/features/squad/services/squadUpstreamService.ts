/**
 * SquadUpstreamService (SQD-036) — orchestrates `squad upstream add | list |
 * sync | remove` through the allowlisted {@link SquadCliService}
 * (PRD FR-031, FR-032).
 *
 * Guarantees:
 * - **CLI-only writes.** NexKit never edits `.squad/upstream.json` itself; the
 *   official Squad CLI owns the manifest. The structured view is re-read from
 *   the manifest via {@link SquadFileService.readUpstreams} after every call.
 * - **Validated inputs.** Sources, names and git refs are validated before
 *   anything is spawned (no leading `-`, no control/shell metacharacters), on
 *   top of the CLI service's own allowlist.
 * - **Backup before write.** The manifest is backed up through BackupService
 *   before any mutating command, and restored if the CLI call fails.
 * - **Confirmation for destructive actions.** `remove` (which also deletes the
 *   cached clone) requires explicit user confirmation.
 * - **Never a silent success.** Partial sync failures and failed initial
 *   clones — which the CLI reports as warnings with a zero exit code — are
 *   surfaced as `upstream-failed` errors, as are post-conditions the manifest
 *   does not reflect.
 */

import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SquadUpstreamOperation,
  isSquadErr,
  squadErr,
  squadOk,
  type SquadError,
  type SquadResult,
  type SquadUpstreamSource,
} from "../models";
import { SquadCliCommand, type SquadCliExecuteOptions, type SquadCliExecution } from "./squadCliService";
import { SquadFileService } from "./squadFileService";

/**
 * Per-operation timeouts in milliseconds. `add` and `sync` may clone or pull
 * git repositories (the CLI allows 60s per git call), so they get more room
 * than the CLI service's standard timeout.
 */
export const SQUAD_UPSTREAM_TIMEOUTS_MS: Readonly<Record<SquadUpstreamOperation, number>> = {
  [SquadUpstreamOperation.List]: 60_000,
  [SquadUpstreamOperation.Add]: 180_000,
  [SquadUpstreamOperation.Sync]: 300_000,
  [SquadUpstreamOperation.Remove]: 60_000,
};

/** Upstream names accepted by the Squad CLI (`isValidUpstreamName`). */
const UPSTREAM_NAME_PATTERN = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;

/** Git refs accepted by the Squad CLI (`isValidGitRef`), without a leading `-`. */
const GIT_REF_PATTERN = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/;

/**
 * Characters rejected in a free-form source. On Windows the CLI shim runs via
 * `cmd.exe`, where these are metacharacters, so they are refused up front.
 */
const FORBIDDEN_SOURCE_CHARS = /[\u0000-\u001f\u007f&|<>^%!"`]/;

const MAX_SOURCE_LENGTH = 2048;

const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;

/** Request to add a free local / git / export upstream (FR-031). */
export interface SquadUpstreamAddRequest {
  /** Local path, git URL (or `owner/repo`), or export JSON file. */
  source: string;

  /** Optional upstream name; derived by the CLI from the source when omitted. */
  name?: string;

  /** Optional git branch/tag for git sources; the CLI defaults to `main`. */
  ref?: string;
}

/** Successful outcome of an upstream operation. */
export interface SquadUpstreamOperationOutcome {
  /** Operation that ran. */
  operation: SquadUpstreamOperation;

  /** Upstream the operation targeted, when known (resolved for `add`). */
  name?: string;

  /** Upstreams re-read from `.squad/upstream.json` after the command. */
  upstreams: SquadUpstreamSource[];

  /** Backup of the manifest taken before a mutating command, if any. */
  backupPath: string | null;

  /** Sanitized, non-empty CLI output lines (ANSI codes stripped). */
  output: string[];
}

/** Minimal CLI seam — structurally satisfied by {@link SquadCliService}. */
export interface SquadUpstreamCli {
  execute(command: SquadCliCommand, options?: SquadCliExecuteOptions): Promise<SquadResult<SquadCliExecution>>;
}

/** Manifest reader seam — structurally satisfied by {@link SquadFileService}. */
export interface SquadUpstreamManifestReader {
  readUpstreams(): Promise<SquadResult<SquadUpstreamSource[]>>;
}

/** Backup seam — structurally satisfied by `GitHubTemplateBackupService`. */
export interface SquadUpstreamManifestBackup {
  backupSquadUpstreamManifest(workspaceRoot: string): Promise<string | null>;
  restoreSquadUpstreamManifest(workspaceRoot: string, backupPath: string): Promise<void>;
}

/** Confirmation seam for destructive upstream actions. */
export interface SquadUpstreamConfirmer {
  /** Ask the user to confirm removing an upstream (and its cached clone). */
  confirmRemove(upstream: SquadUpstreamSource): Promise<boolean>;
}

/** Modal-dialog confirmation used in production. */
export class VscodeSquadUpstreamConfirmer implements SquadUpstreamConfirmer {
  public async confirmRemove(upstream: SquadUpstreamSource): Promise<boolean> {
    const action = "Remove upstream";
    const choice = await vscode.window.showWarningMessage(
      `Remove the Squad upstream "${upstream.id}"?`,
      {
        modal: true,
        detail:
          "Squad CLI will remove it from .squad/upstream.json and delete its cached clone. " +
          "A backup of upstream.json is taken first.",
      },
      action
    );
    return choice === action;
  }
}

/** Constructor options; every I/O seam is injectable for unit tests. */
export interface SquadUpstreamServiceOptions {
  /** Allowlisted Squad CLI wrapper. */
  cli: SquadUpstreamCli;

  /** BackupService used before mutating commands. */
  backup: SquadUpstreamManifestBackup;

  /** Confirmation seam; defaults to a VS Code modal. */
  confirmer?: SquadUpstreamConfirmer;

  /** Manifest reader factory; defaults to {@link SquadFileService}. */
  createReader?: (workspaceRoot: vscode.Uri) => SquadUpstreamManifestReader;

  /** Logger; defaults to the shared {@link LoggingService}. */
  logger?: LoggingService;
}

/** Per-call options. */
export interface SquadUpstreamCallOptions {
  /** Cancellation token forwarded to the CLI process. */
  token?: vscode.CancellationToken;
}

const OPERATION_LABEL: Readonly<Record<SquadUpstreamOperation, string>> = {
  [SquadUpstreamOperation.List]: "Listing Squad upstreams",
  [SquadUpstreamOperation.Add]: "Adding the Squad upstream",
  [SquadUpstreamOperation.Sync]: "Syncing Squad upstreams",
  [SquadUpstreamOperation.Remove]: "Removing the Squad upstream",
};

/**
 * Orchestrates `squad upstream` commands. See the module doc for guarantees.
 */
export class SquadUpstreamService {
  private readonly _cli: SquadUpstreamCli;
  private readonly _backup: SquadUpstreamManifestBackup;
  private readonly _confirmer: SquadUpstreamConfirmer;
  private readonly _createReader: (workspaceRoot: vscode.Uri) => SquadUpstreamManifestReader;
  private readonly _logger: LoggingService;

  constructor(options: SquadUpstreamServiceOptions) {
    this._cli = options.cli;
    this._backup = options.backup;
    this._confirmer = options.confirmer ?? new VscodeSquadUpstreamConfirmer();
    this._createReader = options.createReader ?? ((root) => new SquadFileService(root));
    this._logger = options.logger ?? LoggingService.getInstance();
  }

  /** Read the structured upstream list from `.squad/upstream.json`. */
  public async readUpstreams(workspaceRoot: vscode.Uri | undefined): Promise<SquadResult<SquadUpstreamSource[]>> {
    if (!workspaceRoot) {
      return squadErr(this._noWorkspaceError());
    }
    return this._createReader(workspaceRoot).readUpstreams();
  }

  /**
   * `squad upstream list` (FR-032). The CLI call verifies Squad can read the
   * configuration; the structured list comes from the manifest.
   */
  public async list(
    workspaceRoot: vscode.Uri | undefined,
    options: SquadUpstreamCallOptions = {}
  ): Promise<SquadResult<SquadUpstreamOperationOutcome>> {
    const operation = SquadUpstreamOperation.List;
    if (!workspaceRoot) {
      return squadErr(this._noWorkspaceError());
    }

    const run = await this._run(operation, ["list"], workspaceRoot, options);
    if (isSquadErr(run)) {
      return run;
    }

    const upstreams = await this.readUpstreams(workspaceRoot);
    if (isSquadErr(upstreams)) {
      return upstreams;
    }
    return squadOk({ operation, upstreams: upstreams.value, backupPath: null, output: run.value });
  }

  /** `squad upstream add <source> [--name] [--ref]` (FR-031). */
  public async add(
    workspaceRoot: vscode.Uri | undefined,
    request: SquadUpstreamAddRequest,
    options: SquadUpstreamCallOptions = {}
  ): Promise<SquadResult<SquadUpstreamOperationOutcome>> {
    const operation = SquadUpstreamOperation.Add;
    if (!workspaceRoot) {
      return squadErr(this._noWorkspaceError());
    }

    const source = request.source?.trim() ?? "";
    const name = request.name?.trim() || undefined;
    const ref = request.ref?.trim() || undefined;
    const invalid = this._validateSource(source) ?? this._validateName(name) ?? this._validateRef(ref);
    if (invalid) {
      return squadErr(invalid);
    }

    const current = await this._readCurrent(workspaceRoot);
    if (isSquadErr(current)) {
      return current;
    }
    if (name && current.value.some((u) => u.id === name)) {
      return squadErr({
        code: "invalid-input",
        message: `An upstream named "${name}" already exists.`,
        remediation: "Choose a different name, or remove the existing upstream first.",
      });
    }

    const args = ["add", source];
    if (name) {
      args.push("--name", name);
    }
    if (ref) {
      args.push("--ref", ref);
    }

    const run = await this._runMutating(operation, args, workspaceRoot, options);
    if (isSquadErr(run)) {
      return run;
    }

    const resolvedName = name ?? this._parseAddedName(run.value.output);
    const upstreams = await this.readUpstreams(workspaceRoot);
    if (isSquadErr(upstreams)) {
      return upstreams;
    }

    if (resolvedName && !upstreams.value.some((u) => u.id === resolvedName)) {
      return squadErr({
        code: "upstream-failed",
        message: `Squad reported success, but "${resolvedName}" is not in .squad/upstream.json.`,
        remediation: "Run 'squad upstream list' to inspect the configuration, then retry.",
      });
    }

    const warnings = this._warnings(run.value.output);
    if (warnings.length > 0) {
      return squadErr({
        code: "upstream-failed",
        message: `The upstream${resolvedName ? ` "${resolvedName}"` : ""} was added, but its initial clone failed.`,
        remediation: "Check the git URL, branch and your repository access, then run Sync to retry.",
        detail: warnings.join("\n"),
      });
    }

    return squadOk({
      operation,
      name: resolvedName,
      upstreams: upstreams.value,
      backupPath: run.value.backupPath,
      output: run.value.output,
    });
  }

  /** `squad upstream sync [name]` (FR-032). Syncs every upstream when `name` is omitted. */
  public async sync(
    workspaceRoot: vscode.Uri | undefined,
    name?: string,
    options: SquadUpstreamCallOptions = {}
  ): Promise<SquadResult<SquadUpstreamOperationOutcome>> {
    const operation = SquadUpstreamOperation.Sync;
    if (!workspaceRoot) {
      return squadErr(this._noWorkspaceError());
    }

    const target = name?.trim() || undefined;
    const invalid = this._validateName(target);
    if (invalid) {
      return squadErr(invalid);
    }

    const current = await this._readCurrent(workspaceRoot);
    if (isSquadErr(current)) {
      return current;
    }
    if (current.value.length === 0) {
      return squadErr({
        code: "invalid-input",
        message: "No Squad upstreams are configured.",
        remediation: "Add an upstream first, then sync it.",
      });
    }
    if (target && !current.value.some((u) => u.id === target)) {
      return squadErr(this._notFoundError(target));
    }

    const run = await this._runMutating(operation, target ? ["sync", target] : ["sync"], workspaceRoot, options);
    if (isSquadErr(run)) {
      return run;
    }

    const warnings = this._warnings(run.value.output);
    const summary = this._parseSyncSummary(run.value.output);
    if (warnings.length > 0 || (summary && summary.synced < summary.total)) {
      const counts = summary ? ` (${summary.synced}/${summary.total} synced)` : "";
      return squadErr({
        code: "upstream-failed",
        message: `Some Squad upstreams failed to sync${counts}.`,
        remediation: "Check that each source still exists and is reachable, then sync again.",
        detail: warnings.join("\n") || undefined,
      });
    }

    const upstreams = await this.readUpstreams(workspaceRoot);
    if (isSquadErr(upstreams)) {
      return upstreams;
    }
    return squadOk({
      operation,
      name: target,
      upstreams: upstreams.value,
      backupPath: run.value.backupPath,
      output: run.value.output,
    });
  }

  /** `squad upstream remove <name>` (FR-032). Requires explicit confirmation. */
  public async remove(
    workspaceRoot: vscode.Uri | undefined,
    name: string,
    options: SquadUpstreamCallOptions = {}
  ): Promise<SquadResult<SquadUpstreamOperationOutcome>> {
    const operation = SquadUpstreamOperation.Remove;
    if (!workspaceRoot) {
      return squadErr(this._noWorkspaceError());
    }

    const target = name?.trim() ?? "";
    const invalid = target ? this._validateName(target) : this._requiredNameError();
    if (invalid) {
      return squadErr(invalid);
    }

    const current = await this._readCurrent(workspaceRoot);
    if (isSquadErr(current)) {
      return current;
    }
    const upstream = current.value.find((u) => u.id === target);
    if (!upstream) {
      return squadErr(this._notFoundError(target));
    }

    if (!(await this._confirmer.confirmRemove(upstream))) {
      return squadErr({
        code: "cancelled",
        message: `Removing the upstream "${target}" was cancelled.`,
        remediation: "Nothing was changed. Run Remove again if you still want to remove it.",
      });
    }

    const run = await this._runMutating(operation, ["remove", target], workspaceRoot, options);
    if (isSquadErr(run)) {
      return run;
    }

    const upstreams = await this.readUpstreams(workspaceRoot);
    if (isSquadErr(upstreams)) {
      return upstreams;
    }
    if (upstreams.value.some((u) => u.id === target)) {
      return squadErr({
        code: "upstream-failed",
        message: `Squad reported success, but "${target}" is still in .squad/upstream.json.`,
        remediation: "Run 'squad upstream list' to inspect the configuration, then retry.",
      });
    }
    return squadOk({
      operation,
      name: target,
      upstreams: upstreams.value,
      backupPath: run.value.backupPath,
      output: run.value.output,
    });
  }

  // --- internals ----------------------------------------------------------

  /**
   * Read the manifest before a mutating command. An unreadable manifest aborts
   * the operation: the CLI treats unparseable JSON as empty and would rewrite
   * (and so clobber) it.
   */
  private async _readCurrent(workspaceRoot: vscode.Uri): Promise<SquadResult<SquadUpstreamSource[]>> {
    const result = await this.readUpstreams(workspaceRoot);
    if (isSquadErr(result)) {
      return squadErr({
        ...result.error,
        remediation: `${result.error.remediation ?? "Fix .squad/upstream.json"} Nothing was changed.`.trim(),
      });
    }
    return result;
  }

  /** Back up the manifest, run the CLI, and restore the backup on failure. */
  private async _runMutating(
    operation: SquadUpstreamOperation,
    args: string[],
    workspaceRoot: vscode.Uri,
    options: SquadUpstreamCallOptions
  ): Promise<SquadResult<{ output: string[]; backupPath: string | null }>> {
    let backupPath: string | null;
    try {
      backupPath = await this._backup.backupSquadUpstreamManifest(workspaceRoot.fsPath);
    } catch (error) {
      this._logger.error(`Squad upstream ${operation}: backup failed, aborting before any write`, error);
      return squadErr({
        code: "backup-failed",
        message: "Could not back up .squad/upstream.json.",
        remediation: "Ensure the backup location is writable and you have free disk space, then try again. Nothing was changed.",
        cause: error,
      });
    }

    const run = await this._run(operation, args, workspaceRoot, options);
    if (isSquadErr(run)) {
      if (backupPath) {
        try {
          await this._backup.restoreSquadUpstreamManifest(workspaceRoot.fsPath, backupPath);
        } catch (error) {
          this._logger.error(`Squad upstream ${operation}: failed to restore upstream.json backup`, error);
          return squadErr({
            ...run.error,
            remediation:
              `${run.error.remediation ?? ""} Restoring .squad/upstream.json from the backup also failed; restore it manually from ${backupPath}.`.trim(),
          });
        }
      }
      return run;
    }
    return squadOk({ output: run.value, backupPath });
  }

  /** Run `squad upstream <args>` and return sanitized output lines. */
  private async _run(
    operation: SquadUpstreamOperation,
    args: string[],
    workspaceRoot: vscode.Uri,
    options: SquadUpstreamCallOptions
  ): Promise<SquadResult<string[]>> {
    const result = await this._cli.execute(SquadCliCommand.Upstream, {
      args,
      cwd: workspaceRoot,
      timeoutMs: SQUAD_UPSTREAM_TIMEOUTS_MS[operation],
      token: options.token,
    });
    if (isSquadErr(result)) {
      this._logger.warn(`Squad upstream ${operation} failed (${result.error.code})`);
      return squadErr(this._contextualize(operation, result.error));
    }
    return squadOk(this._lines(`${result.value.stdout}\n${result.value.stderr}`));
  }

  /** Prefix CLI execution failures with the operation for actionable UI copy. */
  private _contextualize(operation: SquadUpstreamOperation, error: SquadError): SquadError {
    if (error.code !== "cli-execution-failed") {
      return error;
    }
    return {
      ...error,
      message: `${OPERATION_LABEL[operation]} failed. ${error.message}`,
      remediation: "Review the reported Squad error, correct the upstream source or name, then retry.",
    };
  }

  private _lines(output: string): string[] {
    return output
      .replace(ANSI_PATTERN, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /** CLI warnings are printed as `⚠️ <message>` on stdout with a zero exit. */
  private _warnings(lines: string[]): string[] {
    return lines.filter((line) => line.startsWith("⚠")).map((line) => line.replace(/^⚠\uFE0F?\s*/, ""));
  }

  private _parseAddedName(lines: string[]): string | undefined {
    for (const line of lines) {
      const match = /Added upstream:\s*([A-Za-z0-9._-]+)\s*\(/.exec(line);
      if (match) {
        return match[1];
      }
    }
    return undefined;
  }

  private _parseSyncSummary(lines: string[]): { synced: number; total: number } | undefined {
    for (const line of lines) {
      const match = /(\d+)\s*\/\s*(\d+)\s+upstream\(s\)\s+synced/.exec(line);
      if (match) {
        return { synced: Number(match[1]), total: Number(match[2]) };
      }
    }
    return undefined;
  }

  private _validateSource(source: string): SquadError | undefined {
    if (!source) {
      return {
        code: "invalid-input",
        message: "An upstream source is required.",
        remediation: "Enter a local path, a git URL (or owner/repo), or a Squad export JSON file.",
      };
    }
    if (source.length > MAX_SOURCE_LENGTH) {
      return {
        code: "invalid-input",
        message: "The upstream source is too long.",
        remediation: `Use a source of at most ${MAX_SOURCE_LENGTH} characters.`,
      };
    }
    if (source.startsWith("-")) {
      return {
        code: "invalid-input",
        message: "The upstream source cannot start with '-'.",
        remediation: "Enter a local path, a git URL (or owner/repo), or a Squad export JSON file.",
      };
    }
    if (FORBIDDEN_SOURCE_CHARS.test(source)) {
      return {
        code: "invalid-input",
        message: "The upstream source contains unsupported characters.",
        remediation: 'Remove control characters and any of & | < > ^ % ! " ` from the source, then retry.',
      };
    }
    return undefined;
  }

  private _validateName(name: string | undefined): SquadError | undefined {
    if (name === undefined || UPSTREAM_NAME_PATTERN.test(name)) {
      return undefined;
    }
    return {
      code: "invalid-input",
      message: `"${name}" is not a valid upstream name.`,
      remediation: "Use only letters, digits, dots, hyphens and underscores, and do not start with '-'.",
    };
  }

  private _validateRef(ref: string | undefined): SquadError | undefined {
    if (ref === undefined || GIT_REF_PATTERN.test(ref)) {
      return undefined;
    }
    return {
      code: "invalid-input",
      message: `"${ref}" is not a valid git branch or tag.`,
      remediation: "Use only letters, digits, dots, hyphens, underscores and slashes, and do not start with '-'.",
    };
  }

  private _requiredNameError(): SquadError {
    return {
      code: "invalid-input",
      message: "An upstream name is required.",
      remediation: "Select the upstream to remove.",
    };
  }

  private _notFoundError(name: string): SquadError {
    return {
      code: "invalid-input",
      message: `The upstream "${name}" is not configured.`,
      remediation: "Refresh the upstream list and pick an existing upstream.",
    };
  }

  private _noWorkspaceError(): SquadError {
    return {
      code: "not-a-workspace",
      message: "Squad upstreams need an open workspace folder.",
      remediation: "Open the project folder that contains .squad/, then retry.",
    };
  }
}
