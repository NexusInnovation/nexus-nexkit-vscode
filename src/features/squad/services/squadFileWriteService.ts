/**
 * Controlled Squad file writer (SQD-026).
 *
 * Keeps write-capable operations separate from the read-only
 * {@link SquadFileService}. Every write target is allowlisted, path segments
 * are validated before URI construction, and {@link GitHubTemplateBackupService}
 * is invoked before writing so FR-006 is enforced for direct edits under
 * `.squad/`.
 */

import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SquadCharter,
  SquadDocKind,
  SquadMarkdownDoc,
  SquadModelConfigDocument,
  SquadResult,
  SQUAD_MODEL_CONFIG_RELATIVE_PATH,
  squadErr,
  squadOk,
} from "../models";
import { parseSquadModelConfig } from "../validation/squadModelConfigValidator";
import { SQUAD_MAX_READ_BYTES } from "./squadFileService";
import { SquadArtifactBackup } from "./squadInitService";

const SQUAD_DIR = ".squad";

const DOC_RELATIVE_PATH: Record<SquadDocKind, string> = {
  [SquadDocKind.Decisions]: `${SQUAD_DIR}/decisions.md`,
  [SquadDocKind.Routing]: `${SQUAD_DIR}/routing.md`,
};

/** Which allowlisted Squad text file should be written. */
export const SquadWritableFileKind = {
  Charter: "charter",
  MarkdownDoc: "markdown-doc",
  ModelConfig: "model-config",
} as const;

export type SquadWritableFileKind = (typeof SquadWritableFileKind)[keyof typeof SquadWritableFileKind];

/** Request for a controlled Squad text-file write. */
export type SquadControlledWriteRequest =
  | {
      /** Write `.squad/agents/<agentId>/charter.md`. */
      kind: typeof SquadWritableFileKind.Charter;

      /** Agent folder name. Must be a single safe path segment. */
      agentId: string;

      /** Raw markdown content to persist. */
      content: string;
    }
  | {
      /** Write one of the allowlisted governance markdown documents. */
      kind: typeof SquadWritableFileKind.MarkdownDoc;

      /** Governance document discriminator. */
      docKind: SquadDocKind;

      /** Raw markdown content to persist. */
      content: string;
    }
  | {
      /** Write `.squad/model-config.json` (FR-063). Callers must validate the JSON first. */
      kind: typeof SquadWritableFileKind.ModelConfig;

      /** Raw JSON content to persist. */
      content: string;
    };

/** Successful metadata from a controlled write. */
export interface SquadControlledWriteOutcome {
  /** Workspace-root-relative POSIX path that was written. */
  relativePath: string;

  /** True when the target did not exist before the write. */
  created: boolean;

  /** Absolute backup path returned by BackupService, or `null` when nothing existed. */
  backupPath: string | null;

  /** UTF-8 byte count written to the target. */
  bytesWritten: number;
}

/** Successful charter write result. */
export interface SquadCharterWriteOutcome extends SquadControlledWriteOutcome {
  /** Updated charter read-model for the panel. */
  charter: SquadCharter;
}

/** Successful governance-doc write result. */
export interface SquadMarkdownDocWriteOutcome extends SquadControlledWriteOutcome {
  /** Updated markdown document read-model for the panel. */
  doc: SquadMarkdownDoc;
}

/** Successful model-config write result (SQD-028). */
export interface SquadModelConfigWriteOutcome extends SquadControlledWriteOutcome {
  /** Updated, validated model configuration document for the panel. */
  document: SquadModelConfigDocument;
}

interface ResolvedWriteTarget {
  relativePath: string;
  uri: vscode.Uri;
}

/** Minimal VS Code filesystem seam for deterministic unit tests. */
export interface SquadWriteFileSystem {
  /** Return file metadata or throw a VS Code-style FileNotFound error. */
  stat(uri: vscode.Uri): Thenable<vscode.FileStat>;

  /** Create a directory and any missing parents. */
  createDirectory(uri: vscode.Uri): Thenable<void>;

  /** Write bytes to a file, replacing existing content. */
  writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
}

/** Controlled write service for editable Squad markdown artifacts. */
export class SquadFileWriteService {
  private readonly _workspaceRoot: vscode.Uri;
  private readonly _backup: SquadArtifactBackup;
  private readonly _fileSystem: SquadWriteFileSystem;
  private readonly _logger: LoggingService;
  private readonly _encoder = new TextEncoder();

  constructor(
    workspaceRoot: vscode.Uri,
    backup: SquadArtifactBackup,
    logger: LoggingService = LoggingService.getInstance(),
    fileSystem: SquadWriteFileSystem = vscode.workspace.fs
  ) {
    this._workspaceRoot = workspaceRoot;
    this._backup = backup;
    this._logger = logger;
    this._fileSystem = fileSystem;
  }

  /** Save `.squad/agents/<agentId>/charter.md` with a prior BackupService call. */
  public async saveCharter(agentId: string, content: string): Promise<SquadResult<SquadCharterWriteOutcome>> {
    const writeResult = await this.saveControlledFile({
      kind: SquadWritableFileKind.Charter,
      agentId,
      content,
    });
    if (!writeResult.ok) {
      return writeResult;
    }

    return squadOk({
      ...writeResult.value,
      charter: {
        agentId,
        relativePath: writeResult.value.relativePath,
        content,
      },
    });
  }

  /** Save `.squad/decisions.md` or `.squad/routing.md` with a prior BackupService call. */
  public async saveMarkdownDoc(
    kind: SquadDocKind,
    content: string
  ): Promise<SquadResult<SquadMarkdownDocWriteOutcome>> {
    const writeResult = await this.saveControlledFile({
      kind: SquadWritableFileKind.MarkdownDoc,
      docKind: kind,
      content,
    });
    if (!writeResult.ok) {
      return writeResult;
    }

    return squadOk({
      ...writeResult.value,
      doc: {
        kind,
        relativePath: writeResult.value.relativePath,
        exists: true,
        content,
      },
    });
  }

  /**
   * Validate and save `.squad/model-config.json` (SQD-028, FR-063). Invalid
   * JSON or an unsupported shape fails with `parse-failed` before
   * BackupService or the file system is touched, so nothing is changed.
   */
  public async saveModelConfig(content: string): Promise<SquadResult<SquadModelConfigWriteOutcome>> {
    if (this._encoder.encode(content).byteLength > SQUAD_MAX_READ_BYTES) {
      return squadErr({
        code: "file-write-failed",
        message: "The Squad model configuration is too large, so it was not saved.",
        remediation: `Keep ${SQUAD_MODEL_CONFIG_RELATIVE_PATH} below ${SQUAD_MAX_READ_BYTES} bytes and try again. Nothing was changed.`,
        detail: SQUAD_MODEL_CONFIG_RELATIVE_PATH,
      });
    }

    const parsed = parseSquadModelConfig(content);
    if (!parsed.ok) {
      return squadErr({
        ...parsed.error,
        message: `${parsed.error.message} Your changes were not saved.`,
      });
    }

    const writeResult = await this.saveControlledFile({ kind: SquadWritableFileKind.ModelConfig, content });
    if (!writeResult.ok) {
      return writeResult;
    }

    return squadOk({
      ...writeResult.value,
      document: {
        relativePath: writeResult.value.relativePath,
        exists: true,
        content,
        config: parsed.value,
      },
    });
  }

  /**
   * Write one allowlisted Squad file. This is the reusable contract for later
   * editable Squad artifacts: add a target kind, resolve it here, and keep the
   * backup/error semantics identical for every caller.
   */
  public async saveControlledFile(
    request: SquadControlledWriteRequest
  ): Promise<SquadResult<SquadControlledWriteOutcome>> {
    const targetResult = this._resolveTarget(request);
    if (!targetResult.ok) {
      return targetResult;
    }
    const target = targetResult.value;

    let existed: boolean;
    try {
      existed = await this._exists(target.uri);
    } catch (error) {
      return this._writeError(target.relativePath, "Could not inspect the existing Squad file.", error);
    }

    let backupPath: string | null;
    try {
      backupPath = await this._backup.backupSquadArtifacts(this._workspaceRoot.fsPath);
    } catch (error) {
      this._logger.error("SquadFileWriteService: backup failed before write", error);
      return squadErr({
        code: "backup-failed",
        message: "Could not back up your existing Squad files, so the edit was not saved.",
        remediation:
          "Ensure the backup location is writable and you have free disk space, then try again. Nothing was changed.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }

    const bytes = this._encoder.encode(request.content);
    try {
      await this._fileSystem.createDirectory(this._parentUri(target.uri));
      await this._fileSystem.writeFile(target.uri, bytes);
    } catch (error) {
      return this._writeError(target.relativePath, "Could not save the Squad file.", error);
    }

    return squadOk({
      relativePath: target.relativePath,
      created: !existed,
      backupPath,
      bytesWritten: bytes.byteLength,
    });
  }

  private _resolveTarget(request: SquadControlledWriteRequest): SquadResult<ResolvedWriteTarget> {
    if (request.kind === SquadWritableFileKind.Charter) {
      const validation = this._validateSegment(request.agentId, "agent id");
      if (validation) {
        return validation;
      }
      const relativePath = `${SQUAD_DIR}/agents/${request.agentId}/charter.md`;
      return squadOk({
        relativePath,
        uri: vscode.Uri.joinPath(this._workspaceRoot, SQUAD_DIR, "agents", request.agentId, "charter.md"),
      });
    }

    if (request.kind === SquadWritableFileKind.ModelConfig) {
      return squadOk({
        relativePath: SQUAD_MODEL_CONFIG_RELATIVE_PATH,
        uri: vscode.Uri.joinPath(this._workspaceRoot, ...SQUAD_MODEL_CONFIG_RELATIVE_PATH.split("/")),
      });
    }

    const relativePath = DOC_RELATIVE_PATH[request.docKind];
    return squadOk({
      relativePath,
      uri: vscode.Uri.joinPath(this._workspaceRoot, ...relativePath.split("/")),
    });
  }

  private _validateSegment(segment: string, label: string): SquadResult<never> | undefined {
    if (segment.length === 0 || /[\\/]/.test(segment) || segment.includes("..")) {
      return squadErr({
        code: "file-write-failed",
        message: `Invalid Squad ${label}.`,
        remediation: `Provide a valid ${label} without path separators.`,
        detail: segment,
      });
    }
    return undefined;
  }

  private async _exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await this._fileSystem.stat(uri);
      return true;
    } catch (error) {
      if (this._isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  private _parentUri(uri: vscode.Uri): vscode.Uri {
    const lastSeparator = uri.path.lastIndexOf("/");
    return uri.with({ path: lastSeparator > 0 ? uri.path.slice(0, lastSeparator) : "/" });
  }

  private _writeError(relativePath: string, message: string, error: unknown): SquadResult<never> {
    this._logger.error(`SquadFileWriteService: failed to write ${relativePath}`, error);
    return squadErr({
      code: "file-write-failed",
      message,
      remediation: `Check file permissions for ${relativePath} and try again.`,
      detail: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }

  private _isNotFound(error: unknown): boolean {
    if (error instanceof vscode.FileSystemError) {
      return error.code === "FileNotFound";
    }
    return typeof error === "object" && error !== null && "code" in error && error.code === "FileNotFound";
  }
}
