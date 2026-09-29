import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SQUAD_SOURCE_VERSION,
  SquadProjectVersion,
  SquadProjectVersionKind,
  SquadResult,
  squadErr,
  squadOk,
} from "../models";

/**
 * Workspace-root-relative path of the Squad project agent file that carries the
 * version stamp (FR-002). Joined with `vscode.Uri.joinPath` by consumers —
 * never string-concatenated.
 */
export const SQUAD_AGENT_MARKER = ".github/agents/squad.agent.md";

/**
 * Matches the `<!-- version: x -->` HTML comment Squad stamps into the project
 * agent file. The captured group is the raw version token.
 */
const VERSION_COMMENT_PATTERN = /<!--\s*version:\s*([^\s>]+)\s*-->/i;

/**
 * A strict semver token: `MAJOR.MINOR.PATCH` with an optional prerelease and/or
 * build metadata suffix. Used to reject malformed stamps (FR-002).
 */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

/** Minimal file-reading seam so the reader is unit-testable without a real fs. */
export interface SquadProjectFileReader {
  /** Whether a file exists at the given URI. */
  exists(uri: vscode.Uri): Promise<boolean>;

  /** Read a file as UTF-8 text. */
  readFile(uri: vscode.Uri): Promise<string>;
}

/** Constructor options for {@link SquadProjectVersionReader}. */
export interface SquadProjectVersionReaderOptions {
  /** File reader; defaults to a `vscode.workspace.fs`-backed reader. */
  fileReader?: SquadProjectFileReader;

  /** Logging service; defaults to the shared singleton. */
  logger?: LoggingService;
}

/**
 * Parse the Squad project version stamp from the raw text of
 * `.github/agents/squad.agent.md` (FR-002).
 *
 * This is a pure function — no fs, no `vscode`. It is the single source of
 * truth for how a stamp is classified so both {@link SquadProjectVersionReader}
 * and {@link SquadDetectionService} agree.
 *
 * Outcomes:
 * - no `<!-- version: x -->` comment → ok, {@link SquadProjectVersionKind.Missing}
 *   (the `unknown` state required by FR-002);
 * - `0.0.0-source` → ok, {@link SquadProjectVersionKind.Source};
 * - a valid semver → ok, {@link SquadProjectVersionKind.Pinned};
 * - a present-but-malformed stamp → an actionable `parse-failed` error. It is
 *   never coerced into a silent success.
 */
export function parseSquadProjectVersion(content: string): SquadResult<SquadProjectVersion> {
  const match = VERSION_COMMENT_PATTERN.exec(content);
  if (!match) {
    return squadOk({
      kind: SquadProjectVersionKind.Missing,
      raw: null,
      version: null,
      isSource: false,
    });
  }

  const raw = match[1].trim();

  if (raw === SQUAD_SOURCE_VERSION) {
    return squadOk({
      kind: SquadProjectVersionKind.Source,
      raw,
      version: null,
      isSource: true,
    });
  }

  if (SEMVER_PATTERN.test(raw)) {
    return squadOk({
      kind: SquadProjectVersionKind.Pinned,
      raw,
      version: raw,
      isSource: false,
    });
  }

  return squadErr({
    code: "parse-failed",
    message: "The Squad project version stamp is present but not a valid version.",
    remediation:
      "Fix the `<!-- version: x -->` comment in .github/agents/squad.agent.md, or re-run the Squad CLI to regenerate it.",
    detail: `Unrecognised version token: "${raw}".`,
  });
}

/**
 * Reads and parses the Squad project version stamp from
 * `.github/agents/squad.agent.md` (FR-002).
 *
 * Every fallible step returns a {@link SquadResult}. A missing agent file and a
 * failed read are actionable errors — this reader never fabricates a version.
 * A missing stamp is a legitimate `unknown` outcome (FR-002), and a
 * present-but-malformed stamp is a hard `parse-failed` error.
 */
export class SquadProjectVersionReader {
  private readonly _fileReader: SquadProjectFileReader;
  private readonly _logger: LoggingService;

  constructor(options: SquadProjectVersionReaderOptions = {}) {
    this._fileReader = options.fileReader ?? createDefaultFileReader();
    this._logger = options.logger ?? LoggingService.getInstance();
  }

  /**
   * Read the project version from the Squad agent file under `workspaceRoot`.
   *
   * @param workspaceRoot Workspace root that should contain the agent file.
   */
  public async read(workspaceRoot: vscode.Uri): Promise<SquadResult<SquadProjectVersion>> {
    const uri = vscode.Uri.joinPath(workspaceRoot, ...SQUAD_AGENT_MARKER.split("/"));

    let exists: boolean;
    try {
      exists = await this._fileReader.exists(uri);
    } catch (error) {
      return this._readError(error);
    }

    if (!exists) {
      return squadErr({
        code: "file-read-failed",
        message: "The Squad project agent file was not found, so no project version could be read.",
        remediation:
          "Initialise Squad in this workspace (it creates .github/agents/squad.agent.md) and try again.",
        detail: `Missing file: ${SQUAD_AGENT_MARKER}.`,
      });
    }

    let content: string;
    try {
      content = await this._fileReader.readFile(uri);
    } catch (error) {
      return this._readError(error);
    }

    return parseSquadProjectVersion(content);
  }

  private _readError(error: unknown): SquadResult<SquadProjectVersion> {
    this._logger.warn("Failed to read the Squad project agent file.", error);
    return squadErr({
      code: "file-read-failed",
      message: "Failed to read the Squad project agent file.",
      remediation: "Check that .github/agents/squad.agent.md is readable, then try again.",
      detail: error instanceof Error ? error.message : undefined,
      cause: error,
    });
  }
}

/** Build the default `vscode.workspace.fs`-backed file reader. */
function createDefaultFileReader(): SquadProjectFileReader {
  return {
    async exists(uri: vscode.Uri): Promise<boolean> {
      try {
        await vscode.workspace.fs.stat(uri);
        return true;
      } catch {
        return false;
      }
    },
    async readFile(uri: vscode.Uri): Promise<string> {
      const data = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(data).toString("utf8");
    },
  };
}
