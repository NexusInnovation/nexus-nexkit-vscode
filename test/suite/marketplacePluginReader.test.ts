import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";
import { MarketplacePluginReader } from "../../src/features/marketplace-management/marketplacePluginReader";
import { MarketplaceService } from "../../src/features/marketplace-management/marketplaceService";
import { VsCodePluginEnablementReader } from "../../src/features/marketplace-management/vsCodePluginEnablementReader";

const MANIFEST = JSON.stringify({
  name: "nexus",
  plugins: [
    { name: "core", description: "Core · shared standards", source: "./plugins/core" },
    { name: "bc", description: "Department · bc — Business Central", source: "./plugins/bc" },
    { name: "tagged", category: "Tools", description: "Department · ignored", source: "./plugins/tagged" },
    { name: "remote", description: "No category", source: { source: "github", repo: "x/y" } },
    { description: "nameless plugin is skipped" },
  ],
});

suite("Unit: MarketplacePluginReader", () => {
  let root: string;
  let reader: MarketplacePluginReader;

  setup(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nexkit-agent-plugins-"));
    reader = new MarketplacePluginReader(root);
  });

  teardown(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  async function writeManifest(repoRoot: string, relative = path.join(".github", "plugin")): Promise<void> {
    await fs.promises.mkdir(path.join(repoRoot, relative), { recursive: true });
    await fs.promises.writeFile(path.join(repoRoot, relative, "marketplace.json"), MANIFEST);
  }

  test("parseRepository handles shorthand, refs and git URLs", () => {
    assert.deepStrictEqual(MarketplacePluginReader.parseRepository("owner/repo#main"), {
      host: "github.com",
      owner: "owner",
      name: "repo",
    });
    assert.deepStrictEqual(MarketplacePluginReader.parseRepository("https://gitlab.com/o/r.git"), {
      host: "gitlab.com",
      owner: "o",
      name: "r",
    });
    assert.deepStrictEqual(MarketplacePluginReader.parseRepository("git@github.com:o/r.git"), {
      host: "github.com",
      owner: "o",
      name: "r",
    });
    assert.strictEqual(MarketplacePluginReader.parseRepository("not a repo"), undefined);
  });

  test("toUrl builds a browsable repository URL", () => {
    assert.strictEqual(MarketplacePluginReader.toUrl("owner/repo#main"), "https://github.com/owner/repo");
    assert.strictEqual(MarketplacePluginReader.toUrl("file:///c%3A/m"), "file:///c%3A/m");
  });

  test("returns undefined when the marketplace has no local copy", async () => {
    assert.strictEqual(await reader.read("owner/missing", {}), undefined);
  });

  test("reads plugins, categories and enabled state from the local clone", async () => {
    const repoRoot = path.join(root, "github.com", "owner", "repo");
    await writeManifest(repoRoot);
    const corePath = MarketplacePluginReader.toPosix(path.join(repoRoot, "plugins", "core"));

    const manifest = await reader.read("owner/repo#main", { [corePath.toUpperCase()]: true, "other/path": true });

    assert.ok(manifest);
    assert.strictEqual(manifest.name, "nexus");
    assert.deepStrictEqual(
      manifest.plugins.map((p) => [p.name, p.category, p.enabled, !!p.path]),
      [
        ["core", "Core", true, true],
        ["bc", "Department", false, true],
        ["tagged", "Tools", false, true],
        ["remote", undefined, false, false],
      ]
    );
    assert.strictEqual(manifest.plugins[0].path, corePath);
  });

  test("falls back to the .claude-plugin manifest and marketplace-repositories cache", async () => {
    await writeManifest(path.join(root, ".marketplace-repositories", "github.com", "o", "r"), ".claude-plugin");

    const manifest = await reader.read("o/r", {});

    assert.strictEqual(manifest?.plugins.length, 4);
  });

  test("ignores invalid manifests", async () => {
    const dir = path.join(root, "github.com", "o", "bad", ".github", "plugin");
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, "marketplace.json"), "{ not json");
    const warn = sinon.stub(console, "warn");
    try {
      assert.strictEqual(await reader.read("o/bad", {}), undefined);
    } finally {
      warn.restore();
    }
  });
});

suite("Unit: MarketplaceService plugin tree", () => {
  let sandbox: sinon.SinonSandbox;
  let root: string;
  let locations: Record<string, boolean>;
  let service: MarketplaceService;

  setup(async () => {
    sandbox = sinon.createSandbox();
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nexkit-agent-plugins-"));
    const repoRoot = path.join(root, "github.com", "owner", "repo");
    await fs.promises.mkdir(path.join(repoRoot, ".github", "plugin"), { recursive: true });
    await fs.promises.writeFile(path.join(repoRoot, ".github", "plugin", "marketplace.json"), MANIFEST);

    locations = {};
    sandbox.stub(SettingsManager, "getPluginMarketplaces").returns(["owner/repo", "owner/missing"]);
    sandbox.stub(SettingsManager, "getPluginLocations").callsFake(() => ({ ...locations }));
    sandbox.stub(SettingsManager, "setPluginLocations").callsFake(async (value: Record<string, boolean>) => {
      locations = { ...value };
    });
    service = new MarketplaceService(new MarketplacePluginReader(root));
  });

  teardown(async () => {
    service.dispose();
    sandbox.restore();
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  test("getTree returns available and unsynced marketplaces", async () => {
    const tree = await service.getTree();

    assert.deepStrictEqual(
      tree.map((m) => [m.source, m.name, m.isAvailable, m.plugins.length, m.url]),
      [
        ["owner/repo", "nexus", true, 4, "https://github.com/owner/repo"],
        ["owner/missing", "owner/missing", false, 0, "https://github.com/owner/missing"],
      ]
    );
  });

  test("setPluginEnabled reuses the existing key spelling", async () => {
    const tree = await service.getTree();
    const corePath = tree[0].plugins[0].path!;
    const existingKey = corePath.replace(/\//g, "\\");
    locations = { [existingKey]: true };

    await service.setPluginEnabled(corePath, false);

    assert.deepStrictEqual(locations, { [existingKey]: false });
  });

  test("setMarketplaceEnabled toggles every local plugin and keeps unrelated entries", async () => {
    locations = { "C:/elsewhere": true };

    await service.setMarketplaceEnabled("OWNER/repo#main", true);

    const enabled = (await service.getTree())[0].plugins.filter((p) => p.enabled).map((p) => p.name);
    assert.deepStrictEqual(enabled, ["core", "bc", "tagged"]);
    assert.strictEqual(locations["C:/elsewhere"], true);
  });

  test("concurrent toggles are serialized and none is lost", async () => {
    (SettingsManager.setPluginLocations as sinon.SinonStub).callsFake(async (value: Record<string, boolean>) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      locations = { ...value };
    });
    const paths = (await service.getTree())[0].plugins.map((p) => p.path).filter((p): p is string => !!p);

    await Promise.all([
      service.setPluginEnabled(paths[0], true),
      service.setPluginEnabled(paths[1], true),
      service.setPluginEnabled(paths[2], true),
      service.setPluginEnabled(paths[0], false),
    ]);

    assert.deepStrictEqual(
      paths.map((p) => locations[p]),
      [false, true, true]
    );
  });

  test("plugins installed through VS Code are shown enabled and handed over to chat.pluginLocations on toggle", async () => {
    const corePath = (await service.getTree())[0].plugins[0].path!;
    const otherUri = "file:///c%3A/elsewhere/plugin";
    const installedPath = path.join(root, "installed.json");
    await fs.promises.writeFile(
      installedPath,
      JSON.stringify({
        version: 1,
        installed: [
          { pluginUri: vscode.Uri.file(corePath).toString(), name: "core" },
          { pluginUri: otherUri, name: "x" },
        ],
      })
    );

    const before = (await service.getTree())[0].plugins[0];
    assert.strictEqual(before.enabled, true);
    assert.strictEqual(before.installedByVsCode, true);

    await service.setPluginEnabled(corePath, false);

    const installed = JSON.parse(await fs.promises.readFile(installedPath, "utf8"));
    assert.deepStrictEqual(
      installed.installed.map((e: { name: string }) => e.name),
      ["x"]
    );
    assert.strictEqual(locations[corePath], false);
    const after = (await service.getTree())[0].plugins[0];
    assert.strictEqual(after.enabled, false);
    assert.strictEqual(after.installedByVsCode, undefined);
  });

  test("plugins switched off in the VS Code profile are flagged as blocked", async () => {
    const corePath = (await service.getTree())[0].plugins[0].path!;
    const blockedService = new MarketplaceService(new MarketplacePluginReader(root), {
      stateDbPath: undefined,
      getDisabledKeys: () => new Set([MarketplacePluginReader.pathKey(corePath)]),
    } as unknown as VsCodePluginEnablementReader);
    try {
      const plugins = (await blockedService.getTree())[0].plugins;
      assert.deepStrictEqual(
        plugins.map((p) => [p.name, !!p.blockedByVsCode]),
        [
          ["core", true],
          ["bc", false],
          ["tagged", false],
          ["remote", false],
        ]
      );
    } finally {
      blockedService.dispose();
    }
  });

  test("setMarketplaceEnabled does nothing for unsynced marketplaces", async () => {
    await service.setMarketplaceEnabled("owner/missing", true);

    assert.ok((SettingsManager.setPluginLocations as sinon.SinonStub).notCalled);
  });
});
