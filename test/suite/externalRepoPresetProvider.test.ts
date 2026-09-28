/**
 * Unit tests for {@link ExternalRepoPresetProvider} (SQD-018). An in-memory
 * {@link SquadPresetFileSystem} serves a fake installed marketplace manifest and
 * a fake `fetch` (via {@link GitHubRecursiveDownloader}) serves the external
 * repositories, so the discover → download → validate pipeline runs without disk
 * access, the VS Code extension host, or real network access.
 */

import * as assert from "assert";
import * as path from "path";
import { GitHubFetchResponse, GitHubRecursiveDownloader } from "../../src/shared/utils/githubRecursiveDownloader";
import {
  ExternalRepoPresetProvider,
  ExternalSquadRepo,
} from "../../src/features/squad/services/externalRepoPresetProvider";
import {
  PresetFileEntry,
  SquadPresetFileSystem,
} from "../../src/features/squad/services/nexusMarketplacePresetProvider";
import { SquadPresetDownloadService } from "../../src/features/squad/services/squadPresetDownloadService";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const AGENT_ROOT = path.join("C:", "fake", "agent-plugins");
const MARKETPLACE_REPO = "NexusInnovation/nexus-plugin-marketplace";
const MARKETPLACE_ROOT = path.join(AGENT_ROOT, "github.com", "NexusInnovation", "nexus-plugin-marketplace");
const CNQ_REPO = "NexusInnovation/nexus-nexkit-templates-cnq";

/** A minimal in-memory file system keyed by absolute path (manifest only here). */
class InMemoryFileSystem implements SquadPresetFileSystem {
  private readonly _files = new Map<string, string>();

  public addFile(absolutePath: string, content: string): void {
    this._files.set(path.normalize(absolutePath), content);
  }

  public async exists(absolutePath: string): Promise<boolean> {
    const target = path.normalize(absolutePath);
    if (this._files.has(target)) {
      return true;
    }
    const prefix = target.endsWith(path.sep) ? target : target + path.sep;
    for (const key of this._files.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  public async readTextFile(absolutePath: string): Promise<string> {
    const target = path.normalize(absolutePath);
    const content = this._files.get(target);
    if (content === undefined) {
      throw new Error(`ENOENT: ${target}`);
    }
    return content;
  }

  public async listFilesRecursively(): Promise<PresetFileEntry[]> {
    return [];
  }
}

interface DirItem {
  name: string;
  path: string;
  download_url: string | null;
  type: string;
}

/**
 * Build a fake `fetch` serving one or more external repos' `squad/` folders.
 * Keyed by `owner/repo`, each carrying a `{ folder-relative path -> content }`
 * tree rooted at `squad/`.
 */
function makeMultiRepoFetch(repos: Record<string, Record<string, string>>) {
  const folderPath = "squad";
  // Per repo: folder-relative dir -> children listing.
  const trees = new Map<string, Map<string, DirItem[]>>();
  const fileContentsByRepo = new Map<string, Record<string, string>>();

  for (const [repo, files] of Object.entries(repos)) {
    const childrenByDir = new Map<string, DirItem[]>();
    const ensureDir = (relDir: string) => {
      if (!childrenByDir.has(relDir)) {
        childrenByDir.set(relDir, []);
      }
    };
    ensureDir("");
    const addDirChain = (relPath: string) => {
      const parts = relPath.split("/");
      for (let i = 0; i < parts.length - 1; i++) {
        const parentRel = parts.slice(0, i).join("/");
        const childRel = parts.slice(0, i + 1).join("/");
        ensureDir(childRel);
        const list = childrenByDir.get(parentRel)!;
        if (!list.some((item) => item.path === `${folderPath}/${childRel}`)) {
          list.push({ name: parts[i], path: `${folderPath}/${childRel}`, download_url: null, type: "dir" });
        }
      }
    };
    for (const rel of Object.keys(files)) {
      addDirChain(rel);
      const parentRel = rel.split("/").slice(0, -1).join("/");
      childrenByDir.get(parentRel)!.push({
        name: rel.split("/").pop()!,
        path: `${folderPath}/${rel}`,
        download_url: `https://raw/${repo}/${rel}`,
        type: "file",
      });
    }
    trees.set(repo, childrenByDir);
    fileContentsByRepo.set(repo, files);
  }

  return async (url: string): Promise<GitHubFetchResponse> => {
    const repoMatch = url.match(/\/repos\/([^/]+)\/([^/]+)\/contents\/([^?]+)\?ref=/);
    if (repoMatch) {
      const repo = `${repoMatch[1]}/${repoMatch[2]}`;
      const fullPath = decodeURIComponent(repoMatch[3]);
      const tree = trees.get(repo);
      if (!tree) {
        return notFound();
      }
      const rel = fullPath === folderPath ? "" : fullPath.slice(folderPath.length + 1);
      const items = tree.get(rel) ?? [];
      return okJson(items);
    }

    const rawMatch = url.match(/^https:\/\/raw\/(.+?\/.+?)\/(.+)$/);
    if (rawMatch) {
      const repo = rawMatch[1];
      const rel = rawMatch[2];
      const content = fileContentsByRepo.get(repo)?.[rel];
      if (content === undefined) {
        return notFound();
      }
      return okText(content);
    }

    return notFound();
  };

  function okJson(items: unknown): GitHubFetchResponse {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => items,
      text: async () => JSON.stringify(items),
    };
  }
  function okText(text: string): GitHubFetchResponse {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  }
  function notFound(): GitHubFetchResponse {
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => "",
    };
  }
}

function validPresetManifest(id: string, displayName: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    id,
    displayName,
    description: `Preset for ${displayName}.`,
    level: "team",
    files: { required: ["team.md", "routing.md"] },
  });
}

function seedManifest(fsys: InMemoryFileSystem, plugins: unknown[]): void {
  fsys.addFile(
    path.join(MARKETPLACE_ROOT, ".github", "plugin", "marketplace.json"),
    JSON.stringify({ metadata: { pluginRoot: "./plugins" }, name: "nexus", plugins }),
  );
}

const GREFFONDORS_ENTRY = {
  name: "greffondors",
  description: "Team · greffondors (gl)",
  source: { repo: CNQ_REPO, source: "github" },
  repository: `https://github.com/${CNQ_REPO}`,
};

function makeProvider(
  fsys: InMemoryFileSystem,
  fetchFn: (url: string) => Promise<GitHubFetchResponse>,
  extra?: { externalRepos?: ExternalSquadRepo[] },
): ExternalRepoPresetProvider {
  const downloader = new GitHubRecursiveDownloader({ fetchFn, logging: silentLogger });
  const downloadService = new SquadPresetDownloadService({ downloader, logging: silentLogger });
  return new ExternalRepoPresetProvider({
    agentPluginsRoot: AGENT_ROOT,
    marketplaceRepo: MARKETPLACE_REPO,
    fileSystem: fsys,
    downloadService,
    logging: silentLogger,
    ...(extra?.externalRepos ? { externalRepos: extra.externalRepos } : {}),
  });
}

suite("ExternalRepoPresetProvider (SQD-018)", () => {
  test("fails when the marketplace is not installed and no explicit repos are given", async () => {
    const provider = makeProvider(new InMemoryFileSystem(), async () => {
      throw new Error("should not fetch");
    });

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "preset-fetch-failed");
    assert.ok(result.error.remediation && result.error.remediation.length > 0);
  });

  test("fails with an invalid marketplace reference", async () => {
    const downloadService = new SquadPresetDownloadService({
      downloader: new GitHubRecursiveDownloader({ fetchFn: async () => notReached(), logging: silentLogger }),
      logging: silentLogger,
    });
    const provider = new ExternalRepoPresetProvider({
      agentPluginsRoot: AGENT_ROOT,
      marketplaceRepo: "not-a-repo",
      fileSystem: new InMemoryFileSystem(),
      downloadService,
      logging: silentLogger,
    });

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "preset-fetch-failed");

    function notReached(): GitHubFetchResponse {
      throw new Error("should not fetch");
    }
  });

  test("returns an empty discovery when the manifest declares no external plugins", async () => {
    const fsys = new InMemoryFileSystem();
    seedManifest(fsys, [
      { name: "core", source: "./plugins/core" },
      { name: "firebolt", source: "./plugins/firebolt" },
    ]);
    const provider = makeProvider(fsys, async () => {
      throw new Error("should not fetch");
    });

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepStrictEqual(result.value.presets, []);
    assert.deepStrictEqual(result.value.rejected, []);
    assert.strictEqual(result.value.unreachable, undefined);
  });

  test("resolves the greffondors preset from its external repository", async () => {
    const fsys = new InMemoryFileSystem();
    seedManifest(fsys, [{ name: "firebolt", source: "./plugins/firebolt" }, GREFFONDORS_ENTRY]);
    const fetchFn = makeMultiRepoFetch({
      [CNQ_REPO]: {
        "manifest.json": validPresetManifest("team-greffondors", "Greffondors Squad"),
        "team.md": "# Greffondors team",
        "routing.md": "# routing",
      },
    });
    const provider = makeProvider(fsys, fetchFn);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
    const preset = result.value.presets[0];
    assert.strictEqual(preset.id, "team-greffondors");
    assert.strictEqual(preset.name, "Greffondors Squad");
    assert.strictEqual(preset.source.kind, "external-repo");
    assert.strictEqual(preset.source.pluginId, "greffondors");
    assert.strictEqual(preset.source.repository, CNQ_REPO);
    assert.strictEqual(preset.source.squadFolderPath, "squad");
    assert.strictEqual(result.value.unreachable, undefined);
  });

  test("surfaces an unreachable external repo without hiding the healthy ones", async () => {
    const fsys = new InMemoryFileSystem();
    seedManifest(fsys, [
      GREFFONDORS_ENTRY,
      {
        name: "private-team",
        source: { repo: "NexusInnovation/nexus-private-team", source: "github" },
      },
    ]);
    // Only the greffondors repo is served; the private-team repo 404s.
    const fetchFn = makeMultiRepoFetch({
      [CNQ_REPO]: {
        "manifest.json": validPresetManifest("team-greffondors", "Greffondors Squad"),
        "team.md": "# team",
        "routing.md": "# routing",
      },
    });
    const provider = makeProvider(fsys, fetchFn);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
    assert.strictEqual(result.value.presets[0].source.pluginId, "greffondors");
    assert.ok(result.value.unreachable && result.value.unreachable.length === 1);
    const unreachable = result.value.unreachable![0];
    assert.strictEqual(unreachable.sourceId, "private-team");
    assert.strictEqual(unreachable.error.code, "preset-fetch-failed");
    assert.ok(unreachable.error.remediation && unreachable.error.remediation.length > 0);
  });

  test("rejects (as unreachable) an external preset that violates the contract", async () => {
    const fsys = new InMemoryFileSystem();
    seedManifest(fsys, [GREFFONDORS_ENTRY]);
    // Missing required team.md / routing.md → contract violation.
    const fetchFn = makeMultiRepoFetch({
      [CNQ_REPO]: {
        "manifest.json": validPresetManifest("team-greffondors", "Greffondors Squad"),
      },
    });
    const provider = makeProvider(fsys, fetchFn);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 0);
    assert.ok(result.value.unreachable && result.value.unreachable.length === 1);
    assert.strictEqual(result.value.unreachable![0].error.code, "preset-invalid");
  });

  test("resolves explicit external repos even when the marketplace is not installed", async () => {
    const fetchFn = makeMultiRepoFetch({
      [CNQ_REPO]: {
        "manifest.json": validPresetManifest("team-greffondors", "Greffondors Squad"),
        "team.md": "# team",
        "routing.md": "# routing",
      },
    });
    const provider = makeProvider(new InMemoryFileSystem(), fetchFn, {
      externalRepos: [{ pluginId: "greffondors", repository: CNQ_REPO }],
    });

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
    assert.strictEqual(result.value.presets[0].source.pluginId, "greffondors");
  });

  test("deduplicates manifest and explicit repos by plugin id", async () => {
    const fsys = new InMemoryFileSystem();
    seedManifest(fsys, [GREFFONDORS_ENTRY]);
    const fetchFn = makeMultiRepoFetch({
      [CNQ_REPO]: {
        "manifest.json": validPresetManifest("team-greffondors", "Greffondors Squad"),
        "team.md": "# team",
        "routing.md": "# routing",
      },
    });
    // Explicit entry with the same pluginId must not double-count.
    const provider = makeProvider(fsys, fetchFn, {
      externalRepos: [{ pluginId: "greffondors", repository: CNQ_REPO }],
    });

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
  });
});
