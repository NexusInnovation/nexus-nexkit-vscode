/**
 * Resolves Squad presets from *external* plugin repositories declared by the
 * Nexus plugin marketplace (SQD-018 / #233, PRD FR-012/FR-013).
 *
 * The Nexus marketplace manifest (`.github/plugin/marketplace.json`) lists both
 * local plugins (`source: "./plugins/<name>"`) and *external* plugins whose
 * definition points at a private repository — e.g. `greffondors`, declared with
 * `source: { repo: "NexusInnovation/nexus-nexkit-templates-cnq", source:
 * "github" }` and a `repository` URL. The local plugins are handled by
 * {@link NexusMarketplacePresetProvider} (SQD-017); this provider owns the
 * external ones: it resolves each external repository, recursively downloads its
 * reserved `squad/` folder via the SQD-016 {@link GitHubRecursiveDownloader}
 * (reused through {@link SquadPresetDownloadService}), and validates it against
 * the SQD-015 contract.
 *
 * Both providers implement the same {@link SquadPresetProvider} contract so the
 * panel and init flows treat every origin uniformly. A single external
 * repository that cannot be reached (private repo without access, network
 * failure, contract violation) is surfaced via
 * {@link SquadPresetDiscovery.unreachable} — visible and actionable — and never
 * hides the presets other repositories returned (PRD: errors must be visible,
 * never a silent success).
 *
 * The marketplace repository coordinates are constructor-injectable. There is no
 * SQD-002 Squad setting yet, so no {@link SettingsManager} dependency is wired
 * here; callers pass overrides (and additional explicit external repos) through
 * the constructor. The file stays `vscode`-free (Node `fs`/`path` only, behind
 * the injectable {@link SquadPresetFileSystem} seam) so it and its unit tests
 * run under plain mocha.
 */

import * as os from "os";
import * as path from "path";
import type { LoggingService } from "../../../shared/services/loggingService";
import { GitHubDownloaderLogger } from "../../../shared/utils/githubRecursiveDownloader";
import {
  SquadPreset,
  SquadPresetDiscovery,
  SquadPresetProvider,
  SquadPresetSource,
  SquadPresetSourceKind,
  UnreachableSquadSource,
} from "../models";
import { squadErr, SquadResult } from "../models/squadResult";
import {
  NodeSquadPresetFileSystem,
  SquadPresetFileSystem,
} from "./nexusMarketplacePresetProvider";
import { SquadPresetDownloadService } from "./squadPresetDownloadService";

/** Default marketplace repository (matches the pre-registered Nexus marketplace). */
const DEFAULT_MARKETPLACE_REPO = "NexusInnovation/nexus-plugin-marketplace";

/** Repo-relative path to the marketplace manifest. */
const MARKETPLACE_MANIFEST_PATH = ".github/plugin/marketplace.json";

/** Reserved preset sub-folder at the root of an external plugin repository. */
const DEFAULT_SQUAD_FOLDER = "squad";

/** A raw marketplace manifest plugin entry (only the fields we rely on). */
interface MarketplacePluginEntry {
  name?: string;
  description?: string;
  /** `"./plugins/<name>"` for a local plugin, or an object for an external repo. */
  source?: string | { repo?: string; source?: string; path?: string };
  /** Present when the plugin lives in an external repository (URL or `owner/repo`). */
  repository?: string;
}

/** Parsed subset of `.github/plugin/marketplace.json`. */
interface MarketplaceManifest {
  plugins?: MarketplacePluginEntry[];
}

/**
 * An external Squad plugin repository to resolve a preset from. Can be derived
 * from the marketplace manifest or injected explicitly (e.g. for tests, or when
 * a repo is not yet declared in the installed marketplace).
 */
export interface ExternalSquadRepo {
  /** Marketplace plugin id (e.g. `greffondors`). */
  pluginId: string;

  /**
   * External repository reference: an `owner/repo`, `owner/repo#branch`, or a
   * `github.com` URL. Resolved by {@link SquadPresetDownloadService}.
   */
  repository: string;

  /**
   * Path to the reserved `squad/` folder within the external repository.
   * Defaults to {@link DEFAULT_SQUAD_FOLDER}.
   */
  squadFolderPath?: string;
}

/** Options for {@link ExternalRepoPresetProvider}. */
export interface ExternalRepoPresetProviderOptions {
  /**
   * Root where VS Code installs Agent Plugins.
   * Defaults to `~/.vscode/agent-plugins`.
   */
  agentPluginsRoot?: string;

  /**
   * Marketplace repository (`owner/repo`) whose manifest declares the external
   * plugins. Defaults to {@link DEFAULT_MARKETPLACE_REPO}.
   */
  marketplaceRepo?: string;

  /**
   * Additional external repositories to resolve, beyond those declared by the
   * installed marketplace manifest. Merged with (and deduplicated against) the
   * manifest-derived list; useful for tests or repos not yet published.
   */
  externalRepos?: ExternalSquadRepo[];

  /** File-system seam (defaults to {@link NodeSquadPresetFileSystem}). */
  fileSystem?: SquadPresetFileSystem;

  /** Download service seam (defaults to a fresh {@link SquadPresetDownloadService}). */
  downloadService?: SquadPresetDownloadService;

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
 * Discovers Squad presets from external plugin repositories (SQD-018).
 */
export class ExternalRepoPresetProvider implements SquadPresetProvider {
  public readonly id = "external-repos";
  public readonly label = "External plugin repositories";

  private readonly _agentPluginsRoot: string;
  private readonly _marketplaceRepo: string;
  private readonly _explicitRepos: ExternalSquadRepo[];
  private readonly _fs: SquadPresetFileSystem;
  private readonly _downloadService: SquadPresetDownloadService;
  private readonly _logging: GitHubDownloaderLogger;

  constructor(options: ExternalRepoPresetProviderOptions = {}) {
    this._agentPluginsRoot =
      options.agentPluginsRoot ?? path.join(os.homedir(), ".vscode", "agent-plugins");
    this._marketplaceRepo = options.marketplaceRepo ?? DEFAULT_MARKETPLACE_REPO;
    this._explicitRepos = options.externalRepos ?? [];
    this._fs = options.fileSystem ?? new NodeSquadPresetFileSystem();
    this._logging = options.logging ?? loadDefaultLogger();
    this._downloadService =
      options.downloadService ?? new SquadPresetDownloadService({ logging: this._logging });
  }

  /**
   * Discover presets from every external plugin repository declared by the
   * marketplace manifest (plus any explicitly-configured repos), downloading and
   * validating each `squad/` folder against the SQD-015 contract.
   *
   * @returns `squadOk` with the discovered presets, any per-preset rejections,
   * and any unreachable repositories. Returns `squadErr` only when the set of
   * external repositories cannot be determined at all (invalid marketplace
   * reference, or the marketplace is not installed / unreadable *and* no
   * explicit repos were provided).
   */
  public async discoverPresets(): Promise<SquadResult<SquadPresetDiscovery>> {
    const reposResult = await this.resolveExternalRepos();
    if (!reposResult.ok) {
      return reposResult;
    }

    const repos = reposResult.value;
    const presets: SquadPreset[] = [];
    const rejected: SquadPresetDiscovery["rejected"] = [];
    const unreachable: UnreachableSquadSource[] = [];

    for (const repo of repos) {
      const source: SquadPresetSource = {
        kind: SquadPresetSourceKind.ExternalRepo,
        pluginId: repo.pluginId,
        repository: repo.repository,
        squadFolderPath: repo.squadFolderPath?.trim() ? repo.squadFolderPath : DEFAULT_SQUAD_FOLDER,
      };

      const download = await this._downloadService.downloadPreset(source);
      if (download.ok) {
        presets.push(download.value.preset);
        continue;
      }

      // A per-repo download or contract failure must not hide the other repos:
      // surface it (visible + actionable) instead of failing the whole scan.
      this._logging.warn(`[Squad] External preset repository could not be resolved`, {
        pluginId: repo.pluginId,
        code: download.error.code,
      });
      unreachable.push({
        sourceId: repo.pluginId,
        label: `${repo.pluginId} (${repo.repository})`,
        source,
        error: download.error,
      });
    }

    this._logging.info(`[Squad] External preset discovery complete`, {
      marketplaceRepo: this._marketplaceRepo,
      repoCount: repos.length,
      presetCount: presets.length,
      unreachableCount: unreachable.length,
    });

    return {
      ok: true,
      value: { presets, rejected, ...(unreachable.length > 0 ? { unreachable } : {}) },
    };
  }

  /**
   * Build the list of external repositories to resolve: those declared by the
   * installed marketplace manifest merged with any explicitly-configured repos.
   */
  private async resolveExternalRepos(): Promise<SquadResult<ExternalSquadRepo[]>> {
    const marketplaceRoot = this.resolveMarketplaceRoot();
    if (!marketplaceRoot) {
      return squadErr({
        code: "preset-fetch-failed",
        message: `Invalid marketplace repository reference '${this._marketplaceRepo}'.`,
        remediation: "Use an 'owner/repo' marketplace reference.",
      });
    }

    const manifestPath = path.join(marketplaceRoot, ...MARKETPLACE_MANIFEST_PATH.split("/"));
    const manifestResult = await this.readManifest(manifestPath);

    if (!manifestResult.ok) {
      // Without the manifest we can still resolve explicitly-injected repos; only
      // when there are none is the source genuinely undiscoverable.
      if (this._explicitRepos.length > 0) {
        this._logging.warn(`[Squad] Marketplace manifest unavailable; using explicit external repos only`, {
          code: manifestResult.error.code,
          explicitCount: this._explicitRepos.length,
        });
        return { ok: true, value: this.dedupeRepos(this._explicitRepos) };
      }
      return manifestResult;
    }

    const plugins = Array.isArray(manifestResult.value.plugins) ? manifestResult.value.plugins : [];
    const fromManifest: ExternalSquadRepo[] = [];

    for (const plugin of plugins) {
      const pluginId = typeof plugin.name === "string" ? plugin.name.trim() : "";
      if (!pluginId) {
        continue;
      }
      const repository = resolveExternalRepository(plugin);
      if (!repository) {
        continue;
      }
      fromManifest.push({ pluginId, repository });
    }

    return { ok: true, value: this.dedupeRepos([...fromManifest, ...this._explicitRepos]) };
  }

  /** Read and parse the marketplace manifest, surfacing actionable failures. */
  private async readManifest(manifestPath: string): Promise<SquadResult<MarketplaceManifest>> {
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

  /** Deduplicate repos by plugin id, keeping the first occurrence. */
  private dedupeRepos(repos: ExternalSquadRepo[]): ExternalSquadRepo[] {
    const seen = new Set<string>();
    const result: ExternalSquadRepo[] = [];
    for (const repo of repos) {
      if (seen.has(repo.pluginId)) {
        continue;
      }
      seen.add(repo.pluginId);
      result.push(repo);
    }
    return result;
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

/**
 * Resolve an external plugin's repository reference from its manifest entry.
 * Prefers the object `source.repo` (`owner/repo`), falling back to the
 * `repository` URL. Returns `undefined` for local plugins.
 */
function resolveExternalRepository(plugin: MarketplacePluginEntry): string | undefined {
  if (plugin.source && typeof plugin.source === "object") {
    const repo = plugin.source.repo;
    if (typeof repo === "string" && repo.trim() !== "") {
      return repo.trim();
    }
  }
  if (typeof plugin.repository === "string" && plugin.repository.trim() !== "") {
    return plugin.repository.trim();
  }
  return undefined;
}
