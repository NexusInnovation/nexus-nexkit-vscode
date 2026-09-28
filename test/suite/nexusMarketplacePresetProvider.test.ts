/**
 * Unit tests for {@link NexusMarketplacePresetProvider} (SQD-017). An in-memory
 * {@link SquadPresetFileSystem} serves a fake installed marketplace so the
 * discover → validate pipeline runs without disk access or the VS Code
 * extension host.
 */

import * as assert from "assert";
import * as path from "path";
import {
  NexusMarketplacePresetProvider,
  PresetFileEntry,
  SquadPresetFileSystem,
} from "../../src/features/squad/services/nexusMarketplacePresetProvider";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const AGENT_ROOT = path.join("C:", "fake", "agent-plugins");
const MARKETPLACE_REPO = "NexusInnovation/nexus-plugin-marketplace";
const MARKETPLACE_ROOT = path.join(AGENT_ROOT, "github.com", "NexusInnovation", "nexus-plugin-marketplace");

/** A minimal in-memory file system keyed by absolute path. */
class InMemoryFileSystem implements SquadPresetFileSystem {
  private readonly _files = new Map<string, string>();
  private readonly _symlinks = new Set<string>();

  public addFile(absolutePath: string, content: string): void {
    this._files.set(path.normalize(absolutePath), content);
  }

  public addSymlink(absolutePath: string): void {
    this._symlinks.add(path.normalize(absolutePath));
  }

  public async exists(absolutePath: string): Promise<boolean> {
    const target = path.normalize(absolutePath);
    if (this._files.has(target) || this._symlinks.has(target)) {
      return true;
    }
    const prefix = target.endsWith(path.sep) ? target : target + path.sep;
    for (const key of [...this._files.keys(), ...this._symlinks]) {
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

  public async listFilesRecursively(absoluteDir: string): Promise<PresetFileEntry[]> {
    const dir = path.normalize(absoluteDir);
    const prefix = dir.endsWith(path.sep) ? dir : dir + path.sep;
    const entries: PresetFileEntry[] = [];
    const toRelative = (key: string): string =>
      key.slice(prefix.length).split(path.sep).join("/");

    for (const key of this._files.keys()) {
      if (key.startsWith(prefix)) {
        entries.push({ relativePath: toRelative(key), isSymbolicLink: false });
      }
    }
    for (const key of this._symlinks) {
      if (key.startsWith(prefix)) {
        entries.push({ relativePath: toRelative(key), isSymbolicLink: true });
      }
    }
    return entries;
  }
}

function marketplaceManifest(plugins: unknown[]): string {
  return JSON.stringify({
    metadata: { pluginRoot: "./plugins" },
    name: "nexus",
    plugins,
  });
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

/** Seed a marketplace manifest at the expected local path. */
function seedMarketplace(fsys: InMemoryFileSystem, plugins: unknown[]): void {
  fsys.addFile(
    path.join(MARKETPLACE_ROOT, ".github", "plugin", "marketplace.json"),
    marketplaceManifest(plugins),
  );
}

/** Seed a local plugin's `squad/` folder with the given relative files. */
function seedPresetFolder(fsys: InMemoryFileSystem, pluginName: string, files: Record<string, string>): void {
  const squadDir = path.join(MARKETPLACE_ROOT, "plugins", pluginName, "squad");
  for (const [relative, content] of Object.entries(files)) {
    fsys.addFile(path.join(squadDir, ...relative.split("/")), content);
  }
}

function newProvider(fsys: InMemoryFileSystem): NexusMarketplacePresetProvider {
  return new NexusMarketplacePresetProvider({
    agentPluginsRoot: AGENT_ROOT,
    marketplaceRepo: MARKETPLACE_REPO,
    fileSystem: fsys,
    logging: silentLogger,
  });
}

suite("NexusMarketplacePresetProvider (SQD-017)", () => {
  test("fails with an actionable error when the marketplace is not installed", async () => {
    const provider = newProvider(new InMemoryFileSystem());

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "preset-fetch-failed");
    assert.ok(result.error.remediation && result.error.remediation.length > 0);
  });

  test("fails with parse-failed when the manifest is not valid JSON", async () => {
    const fsys = new InMemoryFileSystem();
    fsys.addFile(
      path.join(MARKETPLACE_ROOT, ".github", "plugin", "marketplace.json"),
      "{ not json",
    );
    const provider = newProvider(fsys);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "parse-failed");
  });

  test("returns an empty discovery when no plugin ships a squad/ folder", async () => {
    const fsys = new InMemoryFileSystem();
    seedMarketplace(fsys, [
      { name: "core", source: "./plugins/core" },
      { name: "firebolt", source: "./plugins/firebolt" },
    ]);
    const provider = newProvider(fsys);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepStrictEqual(result.value.presets, []);
    assert.deepStrictEqual(result.value.rejected, []);
  });

  test("discovers and validates a local plugin preset", async () => {
    const fsys = new InMemoryFileSystem();
    seedMarketplace(fsys, [{ name: "firebolt", source: "./plugins/firebolt" }]);
    seedPresetFolder(fsys, "firebolt", {
      "manifest.json": validPresetManifest("team-firebolt", "Firebolt Squad"),
      "team.md": "# Firebolt team",
      "routing.md": "# routing",
    });
    const provider = newProvider(fsys);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
    const preset = result.value.presets[0];
    assert.strictEqual(preset.id, "team-firebolt");
    assert.strictEqual(preset.name, "Firebolt Squad");
    assert.strictEqual(preset.source.kind, "marketplace");
    assert.strictEqual(preset.source.pluginId, "firebolt");
    assert.strictEqual(preset.source.repository, MARKETPLACE_REPO);
    assert.strictEqual(preset.source.squadFolderPath, "plugins/firebolt/squad");
    assert.strictEqual(result.value.rejected.length, 0);
  });

  test("rejects (without dropping) a preset that violates the contract", async () => {
    const fsys = new InMemoryFileSystem();
    seedMarketplace(fsys, [{ name: "broken", source: "./plugins/broken" }]);
    // Missing required routing.md and baseline team.md.
    seedPresetFolder(fsys, "broken", {
      "manifest.json": validPresetManifest("team-broken", "Broken Squad"),
    });
    const provider = newProvider(fsys);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 0);
    assert.strictEqual(result.value.rejected.length, 1);
    const rejected = result.value.rejected[0];
    assert.strictEqual(rejected.pluginId, "broken");
    assert.ok(rejected.diagnostics.some((d) => d.code === "required-file-missing"));
    assert.ok(rejected.diagnostics.every((d) => d.severity === "error"));
  });

  test("flags a symlinked preset entry as a blocking rejection", async () => {
    const fsys = new InMemoryFileSystem();
    seedMarketplace(fsys, [{ name: "linky", source: "./plugins/linky" }]);
    seedPresetFolder(fsys, "linky", {
      "manifest.json": validPresetManifest("team-linky", "Linky Squad"),
      "team.md": "# team",
      "routing.md": "# routing",
    });
    fsys.addSymlink(path.join(MARKETPLACE_ROOT, "plugins", "linky", "squad", "sneaky.md"));
    const provider = newProvider(fsys);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.rejected.length, 1);
    assert.ok(result.value.rejected[0].diagnostics.some((d) => d.code === "symlink"));
  });

  test("skips external plugins (deferred to the external-repo provider)", async () => {
    const fsys = new InMemoryFileSystem();
    seedMarketplace(fsys, [
      { name: "firebolt", source: "./plugins/firebolt" },
      {
        name: "greffondors",
        source: { repo: "NexusInnovation/nexus-nexkit-templates-cnq", source: "github" },
        repository: "https://github.com/NexusInnovation/nexus-nexkit-templates-cnq",
      },
    ]);
    seedPresetFolder(fsys, "firebolt", {
      "manifest.json": validPresetManifest("team-firebolt", "Firebolt Squad"),
      "team.md": "# team",
      "routing.md": "# routing",
    });
    // Even if an external plugin somehow had a local squad/ folder, it must be skipped.
    seedPresetFolder(fsys, "greffondors", {
      "manifest.json": validPresetManifest("team-greffondors", "Greffondors Squad"),
      "team.md": "# team",
      "routing.md": "# routing",
    });
    const provider = newProvider(fsys);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
    assert.strictEqual(result.value.presets[0].source.pluginId, "firebolt");
  });

  test("honours a custom pluginRoot from the manifest metadata", async () => {
    const fsys = new InMemoryFileSystem();
    fsys.addFile(
      path.join(MARKETPLACE_ROOT, ".github", "plugin", "marketplace.json"),
      JSON.stringify({
        metadata: { pluginRoot: "./packages" },
        plugins: [{ name: "core", source: "./packages/core" }],
      }),
    );
    const squadDir = path.join(MARKETPLACE_ROOT, "packages", "core", "squad");
    fsys.addFile(path.join(squadDir, "manifest.json"), validPresetManifest("team-core", "Core Squad"));
    fsys.addFile(path.join(squadDir, "team.md"), "# team");
    fsys.addFile(path.join(squadDir, "routing.md"), "# routing");
    const provider = newProvider(fsys);

    const result = await provider.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
    assert.strictEqual(result.value.presets[0].source.squadFolderPath, "packages/core/squad");
  });
});
