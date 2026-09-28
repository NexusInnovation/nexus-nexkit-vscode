/**
 * Unit tests for {@link SquadPresetDownloadService} (SQD-016). The service is
 * wired with a {@link GitHubRecursiveDownloader} backed by a fake `fetch`, so
 * these tests exercise the full download → validate pipeline without the VS
 * Code extension host or real network access.
 */

import * as assert from "assert";
import { SquadPresetSource } from "../../src/features/squad/models/squadPreset";
import { GitHubFetchResponse, GitHubRecursiveDownloader } from "../../src/shared/utils/githubRecursiveDownloader";
import { SquadPresetDownloadService } from "../../src/features/squad/services/squadPresetDownloadService";

interface DirItem {
  name: string;
  path: string;
  download_url: string | null;
  type: string;
}

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const source: SquadPresetSource = {
  kind: "marketplace",
  pluginId: "greffondors",
  repository: "NexusInnovation/nexus-plugin-marketplace",
  squadFolderPath: "plugins/greffondors/squad",
};

/**
 * Build a fake `fetch` that serves a `squad/` folder from an in-memory tree of
 * `{ folder-relative path -> content }`.
 */
function makeFetch(folderPath: string, files: Record<string, string>, symlinks: string[] = []) {
  // Group files by their parent directory (folder-relative).
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
        list.push({
          name: parts[i],
          path: `${folderPath}/${childRel}`,
          download_url: null,
          type: "dir",
        });
      }
    }
  };

  for (const rel of Object.keys(files)) {
    addDirChain(rel);
    const parentRel = rel.split("/").slice(0, -1).join("/");
    childrenByDir.get(parentRel)!.push({
      name: rel.split("/").pop()!,
      path: `${folderPath}/${rel}`,
      download_url: `https://raw/${rel}`,
      type: "file",
    });
  }
  for (const rel of symlinks) {
    addDirChain(rel);
    const parentRel = rel.split("/").slice(0, -1).join("/");
    childrenByDir.get(parentRel)!.push({
      name: rel.split("/").pop()!,
      path: `${folderPath}/${rel}`,
      download_url: null,
      type: "symlink",
    });
  }

  return async (url: string): Promise<GitHubFetchResponse> => {
    const listingMatch = url.match(/\/contents\/([^?]+)\?ref=/);
    if (listingMatch) {
      const fullPath = decodeURIComponent(listingMatch[1]);
      const rel = fullPath === folderPath ? "" : fullPath.slice(folderPath.length + 1);
      const items = childrenByDir.get(rel) ?? [];
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => null },
        json: async () => items,
        text: async () => JSON.stringify(items),
      };
    }

    const rel = url.replace("https://raw/", "");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => JSON.parse(files[rel]),
      text: async () => files[rel],
    };
  };
}

const validManifest = JSON.stringify({
  schemaVersion: 1,
  id: "greffondors",
  displayName: "Greffondors Squad",
  description: "A team preset",
});

function makeService(fetchFn: (url: string) => Promise<GitHubFetchResponse>): SquadPresetDownloadService {
  const downloader = new GitHubRecursiveDownloader({ fetchFn, logging: silentLogger });
  return new SquadPresetDownloadService({ downloader, logging: silentLogger });
}

suite("Unit: SquadPresetDownloadService", () => {
  test("Downloads and validates a well-formed preset", async () => {
    const fetchFn = makeFetch(source.squadFolderPath, {
      "manifest.json": validManifest,
      "team.md": "# Team\n\n## Members\n",
      "agents/link/charter.md": "# Link",
    });
    const service = makeService(fetchFn);

    const result = await service.downloadPreset(source);

    assert.strictEqual(result.ok, true, JSON.stringify(result));
    if (result.ok) {
      assert.strictEqual(result.value.preset.id, "greffondors");
      assert.strictEqual(result.value.preset.name, "Greffondors Squad");
      assert.strictEqual(result.value.preset.source.pluginId, "greffondors");
      assert.strictEqual(result.value.files.get("manifest.json"), validManifest);
      assert.ok(result.value.files.has("agents/link/charter.md"));
      assert.strictEqual(result.value.validation.valid, true);
    }
  });

  test("Returns preset-invalid when the contract is violated (missing team.md)", async () => {
    const fetchFn = makeFetch(source.squadFolderPath, {
      "manifest.json": validManifest,
    });
    const service = makeService(fetchFn);

    const result = await service.downloadPreset(source);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "preset-invalid");
      assert.ok(result.error.detail && result.error.detail.length > 0);
    }
  });

  test("Surfaces symlinks to the validator as blocking errors", async () => {
    const fetchFn = makeFetch(
      source.squadFolderPath,
      { "manifest.json": validManifest, "team.md": "# Team" },
      ["agents/evil.md"],
    );
    const service = makeService(fetchFn);

    const result = await service.downloadPreset(source);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "preset-invalid");
    }
  });

  test("Returns preset-fetch-failed on a GitHub 404", async () => {
    const fetchFn = async (): Promise<GitHubFetchResponse> => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => "",
    });
    const service = makeService(fetchFn);

    const result = await service.downloadPreset(source);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "preset-fetch-failed");
      assert.ok(result.error.remediation && result.error.remediation.length > 0);
    }
  });

  test("Returns preset-fetch-failed when the source has no repository", async () => {
    const service = makeService(async () => {
      throw new Error("should not fetch");
    });

    const result = await service.downloadPreset({
      kind: "local",
      pluginId: "x",
      squadFolderPath: "squad",
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "preset-fetch-failed");
    }
  });

  test("Rejects an invalid repository reference", async () => {
    const service = makeService(async () => {
      throw new Error("should not fetch");
    });

    const result = await service.downloadPreset({
      kind: "external-repo",
      pluginId: "x",
      repository: "not a repo ref",
      squadFolderPath: "squad",
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "preset-fetch-failed");
    }
  });
});
