import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { PluginNode } from "./models/marketplace";

const MANIFEST_PATHS = [path.join(".github", "plugin", "marketplace.json"), path.join(".claude-plugin", "marketplace.json")];
const GIT_URL = /^(?:https?:\/\/|ssh:\/\/(?:[^@/]+@)?|git@)([^/:]+)[/:]([^/]+)\/([^/#]+?)(?:\.git)?\/?(?:#.*)?$/i;
const GITHUB_SHORTHAND = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:#.*)?$/;
const CATEGORY_PREFIX = /^\s*([^·—]+?)\s*·/;

export interface MarketplaceManifest {
  name?: string;
  plugins: PluginNode[];
}

interface RawPlugin {
  name?: unknown;
  description?: unknown;
  category?: unknown;
  source?: unknown;
}

/**
 * Reads marketplace manifests from the local clones VS Code keeps under `~/.vscode/agent-plugins`.
 */
export class MarketplacePluginReader {
  constructor(private readonly _agentPluginsRoot: string = path.join(os.homedir(), ".vscode", "agent-plugins")) {}

  public get agentPluginsRoot(): string {
    return this._agentPluginsRoot;
  }

  /** Candidate local folders for a marketplace source, in lookup order. */
  public getCandidateRoots(source: string): string[] {
    const value = source.trim();
    if (value.toLowerCase().startsWith("file:")) {
      return [vscode.Uri.parse(value).fsPath];
    }

    const repo = MarketplacePluginReader.parseRepository(value);
    if (!repo) {
      return [];
    }
    return [
      path.join(this._agentPluginsRoot, repo.host, repo.owner, repo.name),
      path.join(this._agentPluginsRoot, ".marketplace-repositories", repo.host, repo.owner, repo.name),
    ];
  }

  /** Reads the manifest of a marketplace, or returns undefined when no local copy exists. */
  public async read(source: string, locations: Record<string, boolean>): Promise<MarketplaceManifest | undefined> {
    const enabledByKey = new Map(
      Object.entries(locations).map(([key, value]) => [MarketplacePluginReader.pathKey(key), value === true])
    );

    for (const root of this.getCandidateRoots(source)) {
      for (const relative of MANIFEST_PATHS) {
        const manifestPath = path.join(root, relative);
        let content: string;
        try {
          content = await fs.promises.readFile(manifestPath, "utf8");
        } catch {
          continue;
        }
        try {
          return MarketplacePluginReader.parseManifest(content, root, enabledByKey);
        } catch (error) {
          console.warn(`[Nexkit] Invalid marketplace manifest for ${source}:`, error);
        }
      }
    }
    return undefined;
  }

  public static parseManifest(content: string, root: string, enabledByKey: Map<string, boolean>): MarketplaceManifest {
    const json = JSON.parse(content) as { name?: unknown; plugins?: unknown };
    const rawPlugins = Array.isArray(json.plugins) ? (json.plugins as RawPlugin[]) : [];

    const plugins = rawPlugins
      .filter((p) => p && typeof p.name === "string")
      .map((p): PluginNode => {
        const description = typeof p.description === "string" ? p.description : undefined;
        const category =
          typeof p.category === "string" && p.category.trim()
            ? p.category.trim()
            : description
              ? CATEGORY_PREFIX.exec(description)?.[1]
              : undefined;
        const pluginPath =
          typeof p.source === "string" ? MarketplacePluginReader.toPosix(path.resolve(root, p.source)) : undefined;
        return {
          name: p.name as string,
          description,
          category,
          path: pluginPath,
          enabled: pluginPath ? enabledByKey.get(MarketplacePluginReader.pathKey(pluginPath)) === true : false,
        };
      });

    return { name: typeof json.name === "string" ? json.name : undefined, plugins };
  }

  /** Parses `owner/repo`, GitHub/git URLs into host/owner/name. */
  public static parseRepository(source: string): { host: string; owner: string; name: string } | undefined {
    const url = GIT_URL.exec(source);
    if (url) {
      return { host: url[1].toLowerCase(), owner: url[2], name: url[3] };
    }
    const shorthand = GITHUB_SHORTHAND.exec(source);
    return shorthand ? { host: "github.com", owner: shorthand[1], name: shorthand[2] } : undefined;
  }

  /** Browsable URL for a marketplace source, when it can be determined. */
  public static toUrl(source: string): string | undefined {
    if (source.toLowerCase().startsWith("file:")) {
      return source;
    }
    const repo = MarketplacePluginReader.parseRepository(source);
    return repo ? `https://${repo.host}/${repo.owner}/${repo.name}` : undefined;
  }

  public static toPosix(p: string): string {
    return p.replace(/\\/g, "/");
  }

  /** Comparison key for `chat.pluginLocations` entries: forward slashes, no trailing slash, case-insensitive. */
  public static pathKey(p: string): string {
    return MarketplacePluginReader.toPosix(p).replace(/\/+$/, "").toLowerCase();
  }
}
