import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { MarketplacePluginReader } from "./marketplacePluginReader";

interface InstalledEntry {
  pluginUri?: string;
  marketplace?: string;
  [key: string]: unknown;
}

interface InstalledFile {
  version?: number;
  installed?: InstalledEntry[];
  [key: string]: unknown;
}

/**
 * Access to VS Code's `<agent-plugins>/installed.json`, the list of plugins installed through the plugin browser.
 * VS Code reloads this file on external edits, so removing an entry unloads the plugin.
 */
export class InstalledPluginsStore {
  public readonly filePath: string;

  constructor(agentPluginsRoot: string) {
    this.filePath = path.join(agentPluginsRoot, "installed.json");
  }

  /** Path keys (see {@link MarketplacePluginReader.pathKey}) of plugins installed through VS Code. */
  public async getInstalledKeys(): Promise<Set<string>> {
    const file = await this.read();
    return new Set((file?.installed ?? []).map((e) => InstalledPluginsStore.entryKey(e)).filter((k): k is string => !!k));
  }

  /** Plugin folders installed through VS Code from the given marketplace source (matched on `installed.json`'s `marketplace`). */
  public async getPathsForMarketplace(source: string): Promise<string[]> {
    const file = await this.read();
    const key = InstalledPluginsStore.marketplaceKey(source);
    return (file?.installed ?? [])
      .filter((e) => typeof e.marketplace === "string" && InstalledPluginsStore.marketplaceKey(e.marketplace) === key)
      .map((e) => InstalledPluginsStore.entryPath(e))
      .filter((p): p is string => !!p);
  }

  /** Removes the given plugin folders from installed.json. Returns true when the file changed. */
  public async remove(pluginPaths: string[]): Promise<boolean> {
    const file = await this.read();
    if (!file?.installed) {
      return false;
    }
    const keys = new Set(pluginPaths.map((p) => MarketplacePluginReader.pathKey(p)));
    const kept = file.installed.filter((e) => !keys.has(InstalledPluginsStore.entryKey(e) ?? ""));
    if (kept.length === file.installed.length) {
      return false;
    }
    // Atomic replace keeps a concurrent reader (e.g. VS Code) from seeing a half-written file.
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify({ ...file, installed: kept }, null, "\t"), "utf8");
    await fs.promises.rename(tempPath, this.filePath);
    return true;
  }

  private async read(): Promise<InstalledFile | undefined> {
    let content: string;
    try {
      content = await fs.promises.readFile(this.filePath, "utf8");
    } catch {
      return undefined;
    }
    try {
      const json = JSON.parse(content) as InstalledFile;
      return json && Array.isArray(json.installed) ? json : undefined;
    } catch (error) {
      console.warn("[Nexkit] Unable to parse agent plugins installed.json:", error);
      return undefined;
    }
  }

  private static entryPath(entry: InstalledEntry): string | undefined {
    if (typeof entry?.pluginUri !== "string") {
      return undefined;
    }
    try {
      return vscode.Uri.parse(entry.pluginUri).fsPath;
    } catch {
      return undefined;
    }
  }

  private static entryKey(entry: InstalledEntry): string | undefined {
    const entryPath = InstalledPluginsStore.entryPath(entry);
    return entryPath ? MarketplacePluginReader.pathKey(entryPath) : undefined;
  }

  /** Source without `#ref`, forward slashes, case-insensitive. */
  private static marketplaceKey(source: string): string {
    return source.split("#")[0].trim().replace(/\\/g, "/").toLowerCase();
  }
}
