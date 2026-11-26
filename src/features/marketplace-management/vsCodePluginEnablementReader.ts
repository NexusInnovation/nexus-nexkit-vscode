import { MarketplacePluginReader } from "./marketplacePluginReader";
import * as vscode from "vscode";

const ENABLEMENT_KEY = "agentPlugins.enablement";

interface SqliteStatement {
  get(...params: unknown[]): unknown;
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

type SqliteModule = { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase };

/**
 * Reads, without modifying, the per-profile plugin switch VS Code keeps in its state database
 * (`agentPlugins.enablement` in `state.vscdb`). There is no public API for it, so this is best effort:
 * any failure returns `undefined` and the panel simply cannot show VS Code-side blocks.
 */
export class VsCodePluginEnablementReader {
  constructor(
    private readonly _stateDbPath: string | undefined,
    private readonly _loadSqlite: () => SqliteModule | undefined = VsCodePluginEnablementReader.loadSqlite
  ) {}

  public get stateDbPath(): string | undefined {
    return this._stateDbPath;
  }

  /** Path keys (see {@link MarketplacePluginReader.pathKey}) of plugins switched off in the VS Code profile. */
  public getDisabledKeys(): Set<string> | undefined {
    const raw = this.readRaw();
    return raw === undefined ? undefined : VsCodePluginEnablementReader.parseDisabled(raw);
  }

  public static parseDisabled(raw: string): Set<string> {
    const disabled = new Set<string>();
    let entries: unknown;
    try {
      entries = JSON.parse(raw);
    } catch {
      return disabled;
    }
    if (!Array.isArray(entries)) {
      return disabled;
    }
    for (const entry of entries) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || !VsCodePluginEnablementReader.isDisabled(entry[1])) {
        continue;
      }
      try {
        disabled.add(MarketplacePluginReader.pathKey(vscode.Uri.parse(entry[0]).fsPath));
      } catch {
        // Ignore malformed URIs.
      }
    }
    return disabled;
  }

  /** Accepts the boolean form and the numeric/string `ContributionEnablementState` forms (Disabled*). */
  private static isDisabled(value: unknown): boolean {
    if (typeof value === "boolean") {
      return !value;
    }
    if (typeof value === "string") {
      return value.toLowerCase().startsWith("disabled");
    }
    return false;
  }

  private readRaw(): string | undefined {
    if (!this._stateDbPath) {
      return undefined;
    }
    const sqlite = this._loadSqlite();
    if (!sqlite) {
      return undefined;
    }
    let db: SqliteDatabase | undefined;
    try {
      db = new sqlite.DatabaseSync(this._stateDbPath, { readOnly: true });
      const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(ENABLEMENT_KEY) as { value?: unknown } | undefined;
      if (row?.value === undefined || row.value === null) {
        return "[]";
      }
      return typeof row.value === "string" ? row.value : Buffer.from(row.value as Uint8Array).toString("utf8");
    } catch (error) {
      console.warn("[Nexkit] Unable to read VS Code plugin enablement:", error);
      return undefined;
    } finally {
      try {
        db?.close();
      } catch {
        // ignore
      }
    }
  }

  private static loadSqlite(): SqliteModule | undefined {
    try {
      return require("node:sqlite") as SqliteModule;
    } catch {
      return undefined;
    }
  }
}
