/**
 * Resolves Squad presets from the *local* plugins of the Nexus plugin
 * marketplace (SQD-017, PRD FR-010/FR-011/FR-012).
 *
 * VS Code installs Agent Plugins under `~/.vscode/agent-plugins/github.com/
 * <owner>/<repo>/`. The Nexus marketplace repo
 * (`NexusInnovation/nexus-plugin-marketplace`) ships a
 * `.github/plugin/marketplace.json` manifest listing its plugins; each *local*
 * plugin lives in `plugins/<name>/` and may carry a reserved `squad/`
 * sub-folder (FR-011). This provider reads that installed copy from disk,
 * discovers every plugin that declares a `squad/` preset, validates it against
 * the SQD-015 contract, and produces SQD-001 {@link SquadPreset} descriptors.
 *
 * Only *local* marketplace plugins are handled here. Plugins whose manifest
 * entry points at an external repository (e.g. `greffondors`) are intentionally
 * skipped — they are the responsibility of the external-repository provider
 * (SQD-018 / #233), which implements the same {@link SquadPresetProvider}
 * contract and can reuse {@link SquadPresetDownloadService} for remote content.
 *
 * Kept `vscode`-free (Node `fs`/`path` only, `vscode` never imported) so it and
 * its unit tests run under plain mocha; the file-system access is behind an
 * injectable seam so tests can mock it without touching disk.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { LoggingService } from "../../../shared/services/loggingService";
import { GitHubDownloaderLogger } from "../../../shared/utils/githubRecursiveDownloader";
import {
  RejectedSquadPreset,
  SquadPreset,
  SquadPresetDiagnosticSeverity,
  SquadPresetDiscovery,
  SquadPresetProvider,
  SquadPresetSource,
  SquadPresetSourceKind,
} from "../models";
import { squadErr, SquadResult } from "../models/squadResult";
import {
  SquadPresetValidationInput,
  validateSquadPreset,
} from "../validation/squadPresetValidator";

/** Default marketplace repository (matches the pre-registered Nexus marketplace). */
const DEFAULT_MARKETPLACE_REPO = "NexusInnovation/nexus-plugin-marketplace";

/** Repo-relative path to the marketplace manifest. */
const MARKETPLACE_MANIFEST_PATH = ".github/plugin/marketplace.json";

/** Default plugin root when the manifest does not declare one. */
const DEFAULT_PLUGIN_ROOT = "./plugins";

/** Reserved preset sub-folder inside a plugin (FR-011). */
const SQUAD_FOLDER_NAME = "squad";

/** Extensions whose content is read for manifest parsing and secret scanning. */
const READABLE_EXTENSIONS = [".md", ".json"];

/** A single file entry discovered while walking a preset `squad/` folder. */
export interface PresetFileEntry {
  /** Path relative to the `squad/` folder root, using `/` separators. */
  relativePath: string;

  /** Whether this entry is (or is reached through) a symbolic link. */
  isSymbolicLink: boolean;
}

/**
 * File-system seam used by {@link NexusMarketplacePresetProvider}. Abstracted so
 * unit tests can serve an in-memory marketplace without disk access.
 */
export interface SquadPresetFileSystem {
  /** Whether a file or directory exists at the absolute path. */
  exists(absolutePath: string): Promise<boolean>;

  /** Read a UTF-8 text file at the absolute path. */
  readTextFile(absolutePath: string): Promise<string>;

  /**
   * Recursively list files under an absolute directory. Symlinked entries are
   * reported (flagged) but never followed, so the validator can reject them.
   */
  listFilesRecursively(absoluteDir: string): Promise<PresetFileEntry[]>;
}

/** Default Node-backed {@link SquadPresetFileSystem}. */
export class NodeSquadPresetFileSystem implements SquadPresetFileSystem {
  public async exists(absolutePath: string): Promise<boolean> {
    try {
      await fs.promises.stat(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  public async readTextFile(absolutePath: string): Promise<string> {
    return fs.promises.readFile(absolutePath, "utf8");
  }

  public async listFilesRecursively(absoluteDir: string): Promise<PresetFileEntry[]> {
    const entries: PresetFileEntry[] = [];

    const walk = async (currentDir: string, relativePrefix: string): Promise<void> => {
      const dirents = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const dirent of dirents) {
        const relativePath = relativePrefix ? `${relativePrefix}/${dirent.name}` : dirent.name;
        if (dirent.isSymbolicLink()) {
          entries.push({ relativePath, isSymbolicLink: true });
          continue;
        }
        if (dirent.isDirectory()) {
          await walk(path.join(currentDir, dirent.name), relativePath);
        } else if (dirent.isFile()) {
          entries.push({ relativePath, isSymbolicLink: false });
        }
      }
    };

    await walk(absoluteDir, "");
    return entries;
  }
}

/** A raw marketplace manifest plugin entry (only the fields we rely on). */
interface MarketplacePluginEntry {
  name?: string;
  description?: string;
  /** `"./plugins/<name>"` for a local plugin, or an object for an external repo. */
  source?: string | { repo?: string; source?: string };
  /** Present when the plugin lives in an external repository. */
  repository?: string;
}

/** Parsed subset of `.github/plugin/marketplace.json`. */
interface MarketplaceManifest {
  metadata?: { pluginRoot?: string };
  plugins?: MarketplacePluginEntry[];
}

/** Options for {@link NexusMarketplacePresetProvider}. */
export interface NexusMarketplacePresetProviderOptions {
  /**
   * Root where VS Code installs Agent Plugins.
   * Defaults to `~/.vscode/agent-plugins`.
   */
  agentPluginsRoot?: string;

  /**
   * Marketplace repository (`owner/repo`) to resolve presets from.
   * Defaults to {@link DEFAULT_MARKETPLACE_REPO}.
   */
  marketplaceRepo?: string;

  /** File-system seam (defaults to {@link NodeSquadPresetFileSystem}). */
  fileSystem?: SquadPresetFileSystem;

  /** Structured logger (defaults to the shared LoggingService, lazily loaded). */
  logging?: GitHubDownloaderLogger;
}

/**
 * Lazily resolve the shared {@link LoggingService} without importing `vscode`
 * at module load, so this provider (and its unit tests) stay `vscode`-free.
 */
function loadDefaultLogger(): GitHubDownloaderLogger {
  const loggingModule = require("../../../shared/services/loggingService") as {
    LoggingService: { getInstance(): LoggingService };
  };
  return loggingModule.LoggingService.getInstance();
}

/**
 * Discovers Squad presets from the locally installed Nexus marketplace plugins.
 */
export class NexusMarketplacePresetProvider implements SquadPresetProvider {
  public readonly id = "nexus-marketplace";
  public readonly label = "Nexus plugin marketplace";

  private readonly _agentPluginsRoot: string;
  private readonly _marketplaceRepo: string;
  private readonly _fs: SquadPresetFileSystem;
  private readonly _logging: GitHubDownloaderLogger;

  constructor(options: NexusMarketplacePresetProviderOptions = {}) {
    this._agentPluginsRoot =
      options.agentPluginsRoot ?? path.join(os.homedir(), ".vscode", "agent-plugins");
    this._marketplaceRepo = options.marketplaceRepo ?? DEFAULT_MARKETPLACE_REPO;
    this._fs = options.fileSystem ?? new NodeSquadPresetFileSystem();
    this._logging = options.logging ?? loadDefaultLogger();
  }

  /**
   * Discover presets from every *local* marketplace plugin that ships a
   * `squad/` folder, validating each against the SQD-015 contract.
   */
  public async discoverPresets(): Promise<SquadResult<SquadPresetDiscovery>> {
    const marketplaceRoot = this.resolveMarketplaceRoot();
    if (!marketplaceRoot) {
      return squadErr({
        code: "preset-fetch-failed",
        message: `Invalid marketplace repository reference '${this._marketplaceRepo}'.`,
        remediation: "Use an 'owner/repo' marketplace reference.",
      });
    }

    const manifestPath = path.join(marketplaceRoot, ...MARKETPLACE_MANIFEST_PATH.split("/"));
    if (!(await this._fs.exists(manifestPath))) {
      return squadErr({
        code: "preset-fetch-failed",
        message: "The Nexus plugin marketplace is not installed locally.",
        remediation:
          "Install the Nexus plugin marketplace from the Agent Plugins view, then retry. " +
          "It is normally pre-registered in chat.plugins.marketplaces.",
        detail: `Expected marketplace manifest at ${MARKETPLACE_MANIFEST_PATH} under the installed marketplace folder.`,
      });
    }

    const manifest = await this.readManifest(manifestPath);
    if (!manifest.ok) {
      return manifest;
    }

    const pluginRoot = normalizeRelativePath(
      manifest.value.metadata?.pluginRoot ?? DEFAULT_PLUGIN_ROOT,
    );
    const plugins = Array.isArray(manifest.value.plugins) ? manifest.value.plugins : [];

    const presets: SquadPreset[] = [];
    const rejected: RejectedSquadPreset[] = [];

    for (const plugin of plugins) {
      const pluginId = typeof plugin.name === "string" ? plugin.name.trim() : "";
      if (!pluginId) {
        continue;
      }

      if (isExternalPlugin(plugin)) {
        this._logging.debug(`[Squad] Skipping external marketplace plugin`, { pluginId });
        continue;
      }

      const pluginRelativePath = resolvePluginRelativePath(plugin, pluginRoot);
      const squadFolderRelative = `${pluginRelativePath}/${SQUAD_FOLDER_NAME}`;
      const squadFolderAbsolute = path.join(marketplaceRoot, ...squadFolderRelative.split("/"));

      if (!(await this._fs.exists(squadFolderAbsolute))) {
        continue;
      }

      const source: SquadPresetSource = {
        kind: SquadPresetSourceKind.Marketplace,
        pluginId,
        repository: this._marketplaceRepo,
        squadFolderPath: squadFolderRelative,
      };

      const outcome = await this.validatePluginPreset(squadFolderAbsolute, source);
      if (outcome.ok) {
        presets.push(outcome.value);
      } else {
        rejected.push(outcome.rejected);
      }
    }

    this._logging.info(`[Squad] Marketplace preset discovery complete`, {
      marketplaceRepo: this._marketplaceRepo,
      presetCount: presets.length,
      rejectedCount: rejected.length,
    });

    return { ok: true, value: { presets, rejected } };
  }

  /** Read and parse the marketplace manifest, surfacing actionable failures. */
  private async readManifest(
    manifestPath: string,
  ): Promise<SquadResult<MarketplaceManifest>> {
    let raw: string;
    try {
      raw = await this._fs.readTextFile(manifestPath);
    } catch (error) {
      return squadErr({
        code: "file-read-failed",
        message: "The Nexus marketplace manifest could not be read.",
        remediation: "Reinstall the Nexus plugin marketplace from the Agent Plugins view and retry.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return squadErr({
        code: "parse-failed",
        message: "The Nexus marketplace manifest is not valid JSON.",
        remediation: "Reinstall the Nexus plugin marketplace to restore a valid manifest.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return squadErr({
        code: "parse-failed",
        message: "The Nexus marketplace manifest has an unexpected shape.",
        remediation: "Reinstall the Nexus plugin marketplace to restore a valid manifest.",
      });
    }

    return { ok: true, value: parsed as MarketplaceManifest };
  }

  /**
   * Read a single plugin's `squad/` folder and validate it against the SQD-015
   * contract, returning either the built descriptor or the rejection.
   */
  private async validatePluginPreset(
    squadFolderAbsolute: string,
    source: SquadPresetSource,
  ): Promise<
    { ok: true; value: SquadPreset } | { ok: false; rejected: RejectedSquadPreset }
  > {
    let entries: PresetFileEntry[];
    try {
      entries = await this._fs.listFilesRecursively(squadFolderAbsolute);
    } catch (error) {
      this._logging.warn(`[Squad] Could not read plugin squad/ folder`, {
        pluginId: source.pluginId,
      });
      return {
        ok: false,
        rejected: {
          pluginId: source.pluginId,
          source,
          diagnostics: [
            {
              code: "manifest-unreadable",
              severity: SquadPresetDiagnosticSeverity.Error,
              message: `The '${source.pluginId}' preset squad/ folder could not be read.`,
              remediation: "Reinstall the plugin from the Agent Plugins view and retry.",
            },
          ],
        },
      };
    }

    const contents = await this.readReadableFiles(squadFolderAbsolute, entries);
    const symlinkPaths = entries.filter((e) => e.isSymbolicLink).map((e) => e.relativePath);

    const input: SquadPresetValidationInput = {
      paths: entries.map((e) => e.relativePath),
      readTextFile: (relativePath: string) => contents.get(relativePath),
      symlinkPaths,
      source,
    };

    const validation = validateSquadPreset(input);
    if (!validation.valid || !validation.manifest) {
      const blocking = validation.diagnostics.filter(
        (d) => d.severity === SquadPresetDiagnosticSeverity.Error,
      );
      this._logging.warn(`[Squad] Marketplace preset failed contract validation`, {
        pluginId: source.pluginId,
        blockingCount: blocking.length,
      });
      return {
        ok: false,
        rejected: { pluginId: source.pluginId, source, diagnostics: blocking },
      };
    }

    const manifest = validation.manifest;
    return {
      ok: true,
      value: {
        id: manifest.id,
        name: manifest.displayName,
        ...(manifest.description ? { description: manifest.description } : {}),
        source,
        version: String(manifest.schemaVersion),
      },
    };
  }

  /**
   * Pre-read the text content of readable (`.md`/`.json`) files so the
   * synchronous validator reader can serve them from memory.
   */
  private async readReadableFiles(
    squadFolderAbsolute: string,
    entries: PresetFileEntry[],
  ): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    for (const entry of entries) {
      if (entry.isSymbolicLink || !hasReadableExtension(entry.relativePath)) {
        continue;
      }
      const absolute = path.join(squadFolderAbsolute, ...entry.relativePath.split("/"));
      try {
        contents.set(entry.relativePath, await this._fs.readTextFile(absolute));
      } catch {
        // Leave unread; the validator surfaces a manifest-unreadable diagnostic.
      }
    }
    return contents;
  }

  /** Resolve the absolute installed marketplace root, or undefined if invalid. */
  private resolveMarketplaceRoot(): string | undefined {
    const parts = this._marketplaceRepo.split("/");
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      return undefined;
    }
    return path.join(this._agentPluginsRoot, "github.com", parts[0], parts[1]);
  }
}

/** Whether a plugin entry points at an external repository (SQD-018 / #233). */
function isExternalPlugin(plugin: MarketplacePluginEntry): boolean {
  if (typeof plugin.repository === "string" && plugin.repository.trim() !== "") {
    return true;
  }
  if (plugin.source && typeof plugin.source === "object") {
    return true;
  }
  return false;
}

/**
 * Resolve a local plugin's repo-relative folder path from its manifest entry,
 * falling back to `<pluginRoot>/<name>`.
 */
function resolvePluginRelativePath(
  plugin: MarketplacePluginEntry,
  pluginRoot: string,
): string {
  if (typeof plugin.source === "string" && plugin.source.trim() !== "") {
    return normalizeRelativePath(plugin.source);
  }
  return `${pluginRoot}/${plugin.name}`;
}

/** Normalise a manifest path to `/` separators and strip a leading `./`. */
function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/** Whether a `/`-separated path ends in a readable (`.md`/`.json`) extension. */
function hasReadableExtension(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return READABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
