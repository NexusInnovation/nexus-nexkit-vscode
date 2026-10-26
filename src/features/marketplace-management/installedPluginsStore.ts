import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { MarketplacePluginReader } from "./marketplacePluginReader";

interface InstalledEntry {
  pluginUri?: string;
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
    await fs.promises.writeFile(this.filePath, JSON.stringify({ ...file, installed: kept }, null, "\t"), "utf8");
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

  private static entryKey(entry: InstalledEntry): string | undefined {
    if (typeof entry?.pluginUri !== "string") {
      return undefined;
    }
    try {
      return MarketplacePluginReader.pathKey(vscode.Uri.parse(entry.pluginUri).fsPath);
    } catch {
      return undefined;
    }
  }
}
