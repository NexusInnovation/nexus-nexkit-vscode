/**
 * Read-only reader for the on-disk `.squad/` directory (SQD-011).
 *
 * Parses the roster (`.squad/team.md`), agent charters
 * (`.squad/agents/<id>/charter.md`), governance documents
 * (`.squad/decisions.md`, `.squad/routing.md`), the upstream inheritance
 * manifest (`.squad/upstream.json`) and agent histories / session /
 * orchestration logs. Downstream panel tickets (#227/#228/#229) render these.
 *
 * Design constraints (PRD FR-022, FR-024, FR-025, FR-030 and the SQD-001
 * decision record):
 * - Strictly read-only: this service never writes, moves, or deletes files.
 * - Every fallible operation returns a {@link SquadResult} carrying a
 *   structured, actionable {@link SquadError} on failure — never a bare
 *   `null` that hides an error as success.
 * - Paths are always built with `vscode.Uri.joinPath`, never string-joined,
 *   and the model shapes carry workspace-root-relative POSIX paths.
 * - Potentially large files (histories, logs) are read with a byte limit so
 *   the panel is never handed an unbounded buffer.
 */

import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SquadResult,
  squadOk,
  squadErr,
  SquadError,
  SquadRosterMember,
  SquadCharter,
  SquadMarkdownDoc,
  SquadDocKind,
  SquadUpstreamSource,
  SquadUpstreamKind,
  SquadMarketplaceKind,
  SquadMarketplaceRef,
  SquadModelConfigDocument,
  SQUAD_MODEL_CONFIG_RELATIVE_PATH,
} from "../models";
import { parseSquadModelConfig } from "../validation/squadModelConfigValidator";

/** Root folder that holds all Squad configuration. */
const SQUAD_DIR = ".squad";

/**
 * Maximum number of bytes read from a single history / log file.
 * Content beyond this is truncated and flagged so the panel can offer an
 * "open full file" affordance instead of loading an unbounded buffer.
 */
export const SQUAD_MAX_READ_BYTES = 256 * 1024;

/**
 * A size-limited text file read from `.squad/`.
 * Used for read-only histories and logs (FR-025).
 */
export interface SquadTextFile {
  /** Workspace-root-relative POSIX path to the file. */
  relativePath: string;

  /** File content, truncated to {@link SQUAD_MAX_READ_BYTES} when large. */
  content: string;

  /** Total size of the file on disk, in bytes. */
  sizeBytes: number;

  /** True when {@link content} was truncated to the read limit. */
  truncated: boolean;
}

/** Which log stream a {@link SquadLogRef} belongs to (FR-025). */
export const SquadLogKind = {
  /** Per-session logs under `.squad/log/`. */
  Session: "session",
  /** Coordinator orchestration logs under `.squad/orchestration-log/`. */
  Orchestration: "orchestration",
} as const;

export type SquadLogKind = (typeof SquadLogKind)[keyof typeof SquadLogKind];

/** Directory name for each {@link SquadLogKind}. */
const LOG_DIR_BY_KIND: Record<SquadLogKind, string> = {
  [SquadLogKind.Session]: "log",
  [SquadLogKind.Orchestration]: "orchestration-log",
};

/**
 * A single log file entry (listing only — content is loaded on demand via
 * {@link SquadFileService.readLog}).
 */
export interface SquadLogRef {
  /** Bare file name, e.g. `2026-06-03T155020Z-ralph-round1.md`. */
  name: string;

  /** Which log stream the file belongs to. */
  kind: SquadLogKind;

  /** Workspace-root-relative POSIX path to the log file. */
  relativePath: string;

  /** Size of the log file on disk, in bytes. */
  sizeBytes: number;
}

/** Relative path (POSIX) for a governance document by kind. */
const DOC_RELATIVE_PATH: Record<SquadDocKind, string> = {
  [SquadDocKind.Decisions]: `${SQUAD_DIR}/decisions.md`,
  [SquadDocKind.Routing]: `${SQUAD_DIR}/routing.md`,
};

/**
 * Result of reading `.squad/model-config.json` (FR-063). The document is
 * always returned so an invalid file can still be displayed and fixed; when
 * the content fails validation, {@link validationError} carries the visible,
 * actionable error and `document.config` is `null`.
 */
export interface SquadModelConfigRead {
  /** Raw document plus validated config (when valid). */
  document: SquadModelConfigDocument;

  /** JSON/schema validation failure, when the existing file is invalid. */
  validationError?: SquadError;
}

/**
 * Read-only accessor for the workspace `.squad/` directory.
 * Construct one per workspace folder; pass the folder root as a `vscode.Uri`.
 */
export class SquadFileService {
  private readonly _workspaceRoot: vscode.Uri;
  private readonly _logger: LoggingService;
  private readonly _decoder = new TextDecoder("utf-8");

  constructor(workspaceRoot: vscode.Uri, logger: LoggingService = LoggingService.getInstance()) {
    this._workspaceRoot = workspaceRoot;
    this._logger = logger;
  }

  /**
   * Read and parse the team roster from `.squad/team.md` (FR-022).
   * Members are correlated with `.squad/agents/<id>/charter.md` to populate
   * {@link SquadRosterMember.hasCharter}.
   */
  public async readRoster(): Promise<SquadResult<SquadRosterMember[]>> {
    const relativePath = `${SQUAD_DIR}/team.md`;
    const uri = this._join(SQUAD_DIR, "team.md");

    let raw: SquadTextFile;
    try {
      raw = await this._readText(uri, relativePath);
    } catch (error) {
      return this._readError(relativePath, error, "the team roster");
    }

    const rows = this._parseMembersTable(raw.content);
    if (rows === null) {
      return squadErr({
        code: "parse-failed",
        message: "The Squad roster in .squad/team.md could not be parsed.",
        remediation: "Ensure .squad/team.md contains a '## Members' section with a Markdown table.",
        detail: relativePath,
      });
    }

    const members: SquadRosterMember[] = [];
    for (const row of rows) {
      const hasCharter = await this._exists(this._join(SQUAD_DIR, "agents", row.id, "charter.md"));
      members.push({
        id: row.id,
        name: row.name,
        role: row.role,
        summary: row.summary,
        hasCharter,
      });
    }

    return squadOk(members);
  }

  /**
   * Read a single agent charter from `.squad/agents/<agentId>/charter.md`
   * (FR-022). Returns the raw markdown for read/edit flows layered downstream.
   */
  public async readCharter(agentId: string): Promise<SquadResult<SquadCharter>> {
    const validation = this._validateSegment(agentId, "agent id");
    if (validation) {
      return validation;
    }

    const relativePath = `${SQUAD_DIR}/agents/${agentId}/charter.md`;
    const uri = this._join(SQUAD_DIR, "agents", agentId, "charter.md");

    try {
      const raw = await this._readText(uri, relativePath);
      return squadOk({
        agentId,
        relativePath,
        content: raw.content,
      });
    } catch (error) {
      return this._readError(relativePath, error, `the charter for agent "${agentId}"`);
    }
  }

  /** Read `.squad/decisions.md` as an editable governance document (FR-024). */
  public readDecisions(): Promise<SquadResult<SquadMarkdownDoc>> {
    return this._readMarkdownDoc(SquadDocKind.Decisions);
  }

  /** Read `.squad/routing.md` as an editable governance document (FR-024). */
  public readRouting(): Promise<SquadResult<SquadMarkdownDoc>> {
    return this._readMarkdownDoc(SquadDocKind.Routing);
  }

  /**
   * Read an agent's history file (`.squad/agents/<agentId>/history.md`) in
   * read-only mode with a size limit (FR-025).
   */
  public async readAgentHistory(agentId: string): Promise<SquadResult<SquadTextFile>> {
    const validation = this._validateSegment(agentId, "agent id");
    if (validation) {
      return validation;
    }

    const relativePath = `${SQUAD_DIR}/agents/${agentId}/history.md`;
    const uri = this._join(SQUAD_DIR, "agents", agentId, "history.md");

    try {
      return squadOk(await this._readText(uri, relativePath));
    } catch (error) {
      return this._readError(relativePath, error, `the history for agent "${agentId}"`);
    }
  }

  /**
   * List the log files for a given stream (FR-025) without reading content.
   * Returns an empty list when the log directory does not exist.
   */
  public async listLogs(kind: SquadLogKind): Promise<SquadResult<SquadLogRef[]>> {
    const dir = LOG_DIR_BY_KIND[kind];
    const dirUri = this._join(SQUAD_DIR, dir);

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch (error) {
      if (this._isNotFound(error)) {
        return squadOk([]);
      }
      return this._readError(`${SQUAD_DIR}/${dir}`, error, `the ${kind} logs`);
    }

    const refs: SquadLogRef[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.toLowerCase().endsWith(".md")) {
        continue;
      }
      let sizeBytes = 0;
      try {
        sizeBytes = (await vscode.workspace.fs.stat(this._join(SQUAD_DIR, dir, name))).size;
      } catch {
        // A file that vanished between listing and stat is simply skipped.
        continue;
      }
      refs.push({
        name,
        kind,
        relativePath: `${SQUAD_DIR}/${dir}/${name}`,
        sizeBytes,
      });
    }

    refs.sort((a, b) => a.name.localeCompare(b.name));
    return squadOk(refs);
  }

  /**
   * Read a single log file's content with a size limit (FR-025).
   * `name` must be a bare file name from {@link listLogs}.
   */
  public async readLog(kind: SquadLogKind, name: string): Promise<SquadResult<SquadTextFile>> {
    const validation = this._validateSegment(name, "log file name");
    if (validation) {
      return validation;
    }

    const dir = LOG_DIR_BY_KIND[kind];
    const relativePath = `${SQUAD_DIR}/${dir}/${name}`;
    const uri = this._join(SQUAD_DIR, dir, name);

    try {
      return squadOk(await this._readText(uri, relativePath));
    } catch (error) {
      return this._readError(relativePath, error, `the ${kind} log "${name}"`);
    }
  }

  /**
   * Read and parse `.squad/upstream.json` into upstream inheritance sources
   * (FR-030). Returns an empty list when the manifest does not exist, since
   * upstreams are optional; malformed JSON is reported as a parse error.
   */
  public async readUpstreams(): Promise<SquadResult<SquadUpstreamSource[]>> {
    const relativePath = `${SQUAD_DIR}/upstream.json`;
    const uri = this._join(SQUAD_DIR, "upstream.json");

    let raw: SquadTextFile;
    try {
      raw = await this._readText(uri, relativePath);
    } catch (error) {
      if (this._isNotFound(error)) {
        return squadOk([]);
      }
      return this._readError(relativePath, error, "the upstream manifest");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.content);
    } catch (error) {
      return squadErr({
        code: "parse-failed",
        message: "The Squad upstream manifest (.squad/upstream.json) is not valid JSON.",
        remediation: "Fix the JSON syntax in .squad/upstream.json, or run 'squad upstream list'.",
        detail: relativePath,
        cause: error,
      });
    }

    return this._normalizeUpstreams(parsed);
  }

  /**
   * Read and parse `.squad/plugins/marketplaces.json` into marketplace
   * references (FR-042). Returns an empty list when the file does not exist,
   * since Squad plugins are optional; malformed JSON is a visible parse error.
   */
  public async readPluginMarketplaces(): Promise<SquadResult<SquadMarketplaceRef[]>> {
    const relativePath = `${SQUAD_DIR}/plugins/marketplaces.json`;
    const uri = this._join(SQUAD_DIR, "plugins", "marketplaces.json");

    let raw: SquadTextFile;
    try {
      raw = await this._readText(uri, relativePath);
    } catch (error) {
      if (this._isNotFound(error)) {
        return squadOk([]);
      }
      return this._readError(relativePath, error, "the Squad plugin marketplaces manifest");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.content);
    } catch (error) {
      return squadErr({
        code: "parse-failed",
        message: "The Squad plugin marketplaces manifest (.squad/plugins/marketplaces.json) is not valid JSON.",
        remediation: "Fix the JSON syntax in .squad/plugins/marketplaces.json, or run 'squad plugin marketplace refresh'.",
        detail: relativePath,
        cause: error,
      });
    }

    return squadOk(this._normalizeMarketplaces(parsed));
  }

  /**
   * Read `.squad/model-config.json` (FR-063). A missing file is not an error
   * (per-agent model overrides are optional). An existing file that is not
   * valid JSON or does not match the Squad shape is returned with its raw
   * content plus a `parse-failed` {@link SquadModelConfigRead.validationError}
   * so the panel can show the problem and let the user fix it.
   */
  public async readModelConfig(): Promise<SquadResult<SquadModelConfigRead>> {
    const relativePath = SQUAD_MODEL_CONFIG_RELATIVE_PATH;
    const uri = this._joinRelative(relativePath);

    let raw: SquadTextFile;
    try {
      raw = await this._readText(uri, relativePath);
    } catch (error) {
      if (this._isNotFound(error)) {
        return squadOk({ document: { relativePath, exists: false, content: "", config: null } });
      }
      return this._readError(relativePath, error, "the Squad model configuration");
    }

    if (raw.truncated) {
      return squadErr({
        code: "file-read-failed",
        message: "The Squad model configuration (.squad/model-config.json) is too large to load.",
        remediation: `Reduce ${relativePath} below ${SQUAD_MAX_READ_BYTES} bytes and refresh the Squad panel.`,
        detail: relativePath,
      });
    }

    const parsed = parseSquadModelConfig(raw.content);
    if (!parsed.ok) {
      return squadOk({
        document: { relativePath, exists: true, content: raw.content, config: null },
        validationError: parsed.error,
      });
    }

    return squadOk({ document: { relativePath, exists: true, content: raw.content, config: parsed.value } });
  }

  // --- internal helpers -------------------------------------------------

  private async _readMarkdownDoc(kind: SquadDocKind): Promise<SquadResult<SquadMarkdownDoc>> {
    const relativePath = DOC_RELATIVE_PATH[kind];
    const uri = this._joinRelative(relativePath);

    try {
      const raw = await this._readText(uri, relativePath);
      return squadOk({ kind, relativePath, exists: true, content: raw.content });
    } catch (error) {
      if (this._isNotFound(error)) {
        return squadOk({ kind, relativePath, exists: false, content: "" });
      }
      return this._readError(relativePath, error, `the ${kind} document`);
    }
  }

  private _normalizeUpstreams(parsed: unknown): SquadResult<SquadUpstreamSource[]> {
    const list = this._upstreamList(parsed);
    if (list === undefined) {
      return this._upstreamParseError("Expected .squad/upstream.json to be an array or an object with a sources array.");
    }

    const sources: SquadUpstreamSource[] = [];
    for (const [index, entry] of list.entries()) {
      if (!this._isRecord(entry)) {
        return this._upstreamParseError(`Source at index ${index} must be an object.`);
      }
      const id = this._asString(entry.id) ?? this._asString(entry.name);
      const reference =
        this._asString(entry.reference) ?? this._asString(entry.ref) ?? this._asString(entry.url) ?? this._asString(entry.path);
      if (id === undefined || reference === undefined) {
        return this._upstreamParseError(`Source at index ${index} must include an id/name and reference/ref/url/path.`);
      }
      const kind = this._toUpstreamKind(entry.kind ?? entry.type);
      if (kind === undefined) {
        return this._upstreamParseError(`Source "${id}" has an unsupported kind. Use local, git or export.`);
      }

      const source: SquadUpstreamSource = {
        id,
        kind,
        reference,
      };
      const lastSyncedAt = this._toEpochMillis(entry.lastSyncedAt ?? entry.lastSync ?? entry.syncedAt);
      if (lastSyncedAt !== undefined) {
        source.lastSyncedAt = lastSyncedAt;
      }
      sources.push(source);
    }
    return squadOk(sources);
  }

  private _normalizeMarketplaces(parsed: unknown): SquadMarketplaceRef[] {
    const list =
      Array.isArray(parsed)
        ? parsed
        : this._isRecord(parsed) && Array.isArray(parsed.marketplaces)
          ? parsed.marketplaces
          : this._isRecord(parsed) && Array.isArray(parsed.sources)
            ? parsed.sources
            : [];

    const marketplaces: SquadMarketplaceRef[] = [];
    for (const entry of list) {
      if (typeof entry === "string") {
        const marketplace = this._marketplaceFromString(entry);
        if (marketplace) {
          marketplaces.push(marketplace);
        }
        continue;
      }
      if (!this._isRecord(entry)) {
        continue;
      }
      const marketplace = this._marketplaceFromRecord(entry);
      if (marketplace) {
        marketplaces.push(marketplace);
      }
    }
    return marketplaces;
  }

  private _marketplaceFromString(value: string): SquadMarketplaceRef | undefined {
    const source = value.trim();
    if (source.length === 0) {
      return undefined;
    }
    return {
      id: this._marketplaceIdFromSource(source),
      source,
      kind: this._inferMarketplaceKind(source),
      enabled: true,
    };
  }

  private _marketplaceFromRecord(entry: Record<string, unknown>): SquadMarketplaceRef | undefined {
    const source =
      this._asString(entry.source) ??
      this._asString(entry.repository) ??
      this._asString(entry.repo) ??
      this._asString(entry.url) ??
      this._asString(entry.path) ??
      this._asString(entry.reference) ??
      this._asString(entry.id) ??
      this._asString(entry.name);
    if (source === undefined) {
      return undefined;
    }

    const id = this._asString(entry.id) ?? this._asString(entry.name) ?? this._marketplaceIdFromSource(source);
    const marketplace: SquadMarketplaceRef = {
      id,
      displayName: this._asString(entry.displayName) ?? this._asString(entry.title),
      source,
      kind: this._toMarketplaceKind(entry.kind ?? entry.type, source),
      enabled: this._asBoolean(entry.enabled) ?? !this._asBoolean(entry.disabled),
    };
    const ref = this._asString(entry.ref) ?? this._asString(entry.branch) ?? this._asString(entry.revision);
    if (ref !== undefined) {
      marketplace.ref = ref;
    }
    const lastRefreshedAt = this._toEpochMillis(entry.lastRefreshedAt ?? entry.lastRefresh ?? entry.refreshedAt);
    if (lastRefreshedAt !== undefined) {
      marketplace.lastRefreshedAt = lastRefreshedAt;
    }
    return marketplace;
  }

  private _marketplaceIdFromSource(source: string): string {
    const withoutRef = source.split("#", 1)[0].trim();
    const parts = withoutRef.split(/[\\/]/).filter((part) => part.length > 0);
    return parts.length > 0 ? parts[parts.length - 1].replace(/\.git$/i, "") : withoutRef;
  }

  private _toMarketplaceKind(value: unknown, source: string): SquadMarketplaceKind {
    switch (this._asString(value)?.toLowerCase()) {
      case SquadMarketplaceKind.GitHub:
        return SquadMarketplaceKind.GitHub;
      case SquadMarketplaceKind.Local:
        return SquadMarketplaceKind.Local;
      case SquadMarketplaceKind.Url:
        return SquadMarketplaceKind.Url;
      case SquadMarketplaceKind.Unknown:
        return SquadMarketplaceKind.Unknown;
      default:
        return this._inferMarketplaceKind(source);
    }
  }

  private _inferMarketplaceKind(source: string): SquadMarketplaceKind {
    if (/^https?:\/\//i.test(source)) {
      return source.includes("github.com") ? SquadMarketplaceKind.GitHub : SquadMarketplaceKind.Url;
    }
    if (/^[^/\s]+\/[^/\s]+(?:#.+)?$/i.test(source)) {
      return SquadMarketplaceKind.GitHub;
    }
    return SquadMarketplaceKind.Local;
  }

  private _upstreamList(parsed: unknown): unknown[] | undefined {
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (this._isRecord(parsed) && Array.isArray(parsed.sources)) {
      return parsed.sources;
    }
    return undefined;
  }

  private _upstreamParseError(detail: string): SquadResult<never> {
    return squadErr({
      code: "parse-failed",
      message: "The Squad upstream manifest (.squad/upstream.json) has an unsupported shape.",
      remediation: "Use an array of upstream sources, or an object with a sources array. Each source needs an id, kind and reference.",
      detail,
    });
  }

  private _toUpstreamKind(value: unknown): SquadUpstreamKind | undefined {
    const kind = this._asString(value)?.toLowerCase() ?? SquadUpstreamKind.Local;
    switch (kind) {
      case SquadUpstreamKind.Git:
        return SquadUpstreamKind.Git;
      case SquadUpstreamKind.Export:
        return SquadUpstreamKind.Export;
      case SquadUpstreamKind.Local:
        return SquadUpstreamKind.Local;
      default:
        return undefined;
    }
  }

  private _toEpochMillis(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) {
        return ms;
      }
    }
    return undefined;
  }

  /**
   * Parse the `## Members` Markdown table from `team.md`.
   * Returns `null` when no members table is present (a parse failure), or an
   * array of parsed rows (possibly empty when the table has no data rows).
   */
  private _parseMembersTable(markdown: string): { id: string; name: string; role?: string; summary?: string }[] | null {
    const lines = markdown.split(/\r?\n/);
    const headingIndex = lines.findIndex((line) => /^#{1,6}\s+Members\b/i.test(line.trim()));
    if (headingIndex === -1) {
      return null;
    }

    const tableLines: string[] = [];
    for (let i = headingIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^#{1,6}\s+/.test(line)) {
        break;
      }
      if (line.startsWith("|")) {
        tableLines.push(line);
      }
    }

    if (tableLines.length < 2) {
      return null;
    }

    const header = this._splitRow(tableLines[0]).map((cell) => cell.toLowerCase());
    const nameIndex = header.indexOf("name");
    const roleIndex = header.indexOf("role");
    const charterIndex = header.indexOf("charter");
    const notesIndex = header.findIndex((cell) => cell === "notes" || cell === "summary");
    if (nameIndex === -1) {
      return null;
    }

    const rows: { id: string; name: string; role?: string; summary?: string }[] = [];
    for (let i = 1; i < tableLines.length; i++) {
      const cells = this._splitRow(tableLines[i]);
      if (cells.length === 0 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        continue;
      }
      const name = cells[nameIndex]?.trim();
      if (!name) {
        continue;
      }
      const charterCell = charterIndex >= 0 ? cells[charterIndex] : undefined;
      const id = this._agentIdFromCharter(charterCell) ?? this._slug(name);
      const role = this._cleanCell(roleIndex >= 0 ? cells[roleIndex] : undefined);
      const summary = this._cleanCell(notesIndex >= 0 ? cells[notesIndex] : undefined);
      rows.push({ id, name, role, summary });
    }

    return rows;
  }

  private _splitRow(line: string): string[] {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
  }

  private _agentIdFromCharter(cell: string | undefined): string | undefined {
    if (!cell) {
      return undefined;
    }
    const match = cell.match(/agents\/([^/`]+)\/charter\.md/i);
    return match ? match[1].trim() : undefined;
  }

  private _cleanCell(cell: string | undefined): string | undefined {
    if (cell === undefined) {
      return undefined;
    }
    const value = cell.replace(/`/g, "").trim();
    return value.length > 0 ? value : undefined;
  }

  private _slug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private _join(...segments: string[]): vscode.Uri {
    return vscode.Uri.joinPath(this._workspaceRoot, ...segments);
  }

  private _joinRelative(relativePath: string): vscode.Uri {
    return vscode.Uri.joinPath(this._workspaceRoot, ...relativePath.split("/"));
  }

  private async _exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private async _readText(uri: vscode.Uri, relativePath: string): Promise<SquadTextFile> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const sizeBytes = bytes.byteLength;
    const truncated = sizeBytes > SQUAD_MAX_READ_BYTES;
    const slice = truncated ? bytes.subarray(0, SQUAD_MAX_READ_BYTES) : bytes;
    return {
      relativePath,
      content: this._decoder.decode(slice),
      sizeBytes,
      truncated,
    };
  }

  private _validateSegment(segment: string, label: string): SquadResult<never> | undefined {
    if (segment.length === 0 || /[\\/]/.test(segment) || segment.includes("..")) {
      return squadErr({
        code: "file-read-failed",
        message: `Invalid Squad ${label}.`,
        remediation: `Provide a valid ${label} without path separators.`,
        detail: segment,
      });
    }
    return undefined;
  }

  private _readError(relativePath: string, error: unknown, subject: string): SquadResult<never> {
    if (this._isNotFound(error)) {
      const failure: SquadError = {
        code: "file-read-failed",
        message: `Could not find ${subject}.`,
        remediation: `Expected a file at ${relativePath}. Confirm Squad is initialized in this workspace.`,
        detail: relativePath,
        cause: error,
      };
      return squadErr(failure);
    }

    this._logger.error(`SquadFileService: failed to read ${relativePath}`, error);
    return squadErr({
      code: "file-read-failed",
      message: `Could not read ${subject}.`,
      remediation: `Check file permissions for ${relativePath} and try again.`,
      detail: relativePath,
      cause: error,
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

  private _asString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private _asBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
  }
}
