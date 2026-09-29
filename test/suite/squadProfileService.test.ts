import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  SquadMarketplaceKind,
  SquadPluginStatus,
  SquadUpstreamKind,
  isSquadErr,
  isSquadOk,
  squadOk,
} from "../../src/features/squad/models";
import { SquadProfileFileSystem, SquadProfileService } from "../../src/features/squad/services/squadProfileService";
import { SquadArtifactBackup } from "../../src/features/squad/services/squadInitService";

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function fileStat(size = 1): vscode.FileStat {
  return {
    type: vscode.FileType.File,
    ctime: 0,
    mtime: 0,
    size,
  };
}

suite("Unit: SquadProfileService (SQD-048 profiles)", () => {
  let tempDir: string;
  let backup: SquadArtifactBackup;
  let backupSquadArtifacts: sinon.SinonStub;

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-squad-profile-"));
    backupSquadArtifacts = sinon.stub().resolves("backup-path");
    backup = {
      backupSquadArtifacts,
      restoreSquadArtifacts: sinon.stub().resolves(),
    };
  });

  teardown(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("captureCurrentConfig stores the FR-065 Squad profile contract", async () => {
    writeFile(
      tempDir,
      ".squad/config.json",
      JSON.stringify({
        presetId: "team-alpha",
        platform: "github",
        ralph: { autoStartWatch: true },
      })
    );
    writeFile(
      tempDir,
      ".squad/upstream.json",
      JSON.stringify({ upstreams: [{ id: "org", kind: "git", source: "NexusInnovation/squad-org", ref: "main" }] })
    );
    writeFile(
      tempDir,
      ".squad/plugins/marketplaces.json",
      JSON.stringify({ marketplaces: ["NexusInnovation/nexus-plugin-marketplace"] })
    );
    writeFile(
      tempDir,
      ".squad/model-config.json",
      JSON.stringify({ default: "gpt-5.6-terra", overrides: { link: "claude-opus-5.5" } })
    );

    const service = new SquadProfileService({
      backup,
      getWorkspaceRoot: () => vscode.Uri.file(tempDir),
      createPluginService: () => ({
        readMarketplaces: sinon.stub(),
        listInstalledPlugins: sinon.stub().resolves(
          squadOk([
            {
              id: "nexus-plugin",
              displayName: "Nexus Plugin",
              marketplace: "nexus-plugin-marketplace",
              enabled: true,
              status: SquadPluginStatus.Enabled,
              version: "1.2.3",
            },
          ])
        ),
      }),
      logger: { error: () => undefined, warn: () => undefined } as never,
    });

    const result = await service.captureCurrentConfig();

    assert.ok(isSquadOk(result));
    assert.ok(result.value);
    assert.strictEqual(result.value.presetId, "team-alpha");
    assert.deepStrictEqual(result.value.ralph, { autoStartWatch: true, backlogPlatform: "github" });
    assert.deepStrictEqual(result.value.upstreams, [
      {
        id: "org",
        kind: SquadUpstreamKind.Git,
        reference: "NexusInnovation/squad-org",
        gitRef: "main",
      },
    ]);
    assert.deepStrictEqual(result.value.pluginMarketplaces, [
      {
        id: "nexus-plugin-marketplace",
        source: "NexusInnovation/nexus-plugin-marketplace",
        kind: SquadMarketplaceKind.GitHub,
        enabled: true,
      },
    ]);
    assert.deepStrictEqual(result.value.plugins, [
      {
        id: "nexus-plugin",
        displayName: "Nexus Plugin",
        marketplace: "nexus-plugin-marketplace",
        enabled: true,
        status: SquadPluginStatus.Enabled,
        version: "1.2.3",
      },
    ]);
    assert.deepStrictEqual(result.value.modelConfig, {
      defaultModel: "gpt-5.6-terra",
      overrides: [{ agentId: "link", model: "claude-opus-5.5" }],
    });
  });

  test("captureCurrentConfig fails visibly when a present model config is invalid", async () => {
    writeFile(tempDir, ".squad/config.json", JSON.stringify({ presetId: "team-alpha" }));
    writeFile(tempDir, ".squad/model-config.json", '{ "default": ');

    const service = new SquadProfileService({
      backup,
      getWorkspaceRoot: () => vscode.Uri.file(tempDir),
      createPluginService: () => ({
        readMarketplaces: sinon.stub(),
        listInstalledPlugins: sinon.stub().resolves(squadOk([])),
      }),
      logger: { error: () => undefined, warn: () => undefined } as never,
    });

    const result = await service.captureCurrentConfig();

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "parse-failed");
  });

  test("applyProfileConfig backs up once and writes file-backed Squad config", async () => {
    const stat = sinon.stub().resolves(fileStat());
    const readFile = sinon.stub().resolves(encode("{}"));
    const createDirectory = sinon.stub().resolves();
    const writeFileStub = sinon.stub().resolves();
    const fileSystem: SquadProfileFileSystem = {
      stat,
      readFile,
      createDirectory,
      writeFile: writeFileStub,
    };
    const service = new SquadProfileService({
      backup,
      getWorkspaceRoot: () => vscode.Uri.file(tempDir),
      fileSystem,
      logger: { error: () => undefined, warn: () => undefined } as never,
    });

    const result = await service.applyProfileConfig({
      presetId: "team-alpha",
      ralph: { autoStartWatch: false, backlogPlatform: "ado" },
      upstreams: [{ id: "team", kind: SquadUpstreamKind.Local, reference: "../team-squad" }],
      pluginMarketplaces: [
        {
          id: "core",
          source: "NexusInnovation/nexus-plugin-marketplace",
          kind: SquadMarketplaceKind.GitHub,
          enabled: true,
        },
      ],
      plugins: [{ id: "nexus-plugin", enabled: true, status: SquadPluginStatus.Enabled }],
      modelConfig: { defaultModel: "gpt-5.6-terra", overrides: [{ agentId: "link", model: "gpt-5.6-sol" }] },
    });

    assert.ok(isSquadOk(result));
    assert.deepStrictEqual(result.value, {
      applied: true,
      backupPath: "backup-path",
      writtenFiles: [
        ".squad/config.json",
        ".squad/upstream.json",
        ".squad/plugins/marketplaces.json",
        ".squad/model-config.json",
      ],
      pluginCount: 1,
    });
    assert.ok(backupSquadArtifacts.calledOnce);
    assert.ok(backupSquadArtifacts.calledBefore(writeFileStub));
    assert.strictEqual(writeFileStub.callCount, 4);

    const writes = new Map<string, string>();
    for (const call of writeFileStub.getCalls()) {
      const uri = call.args[0] as vscode.Uri;
      writes.set(uri.path.replace(/\\/g, "/"), new TextDecoder().decode(call.args[1] as Uint8Array));
    }
    assert.ok([...writes.keys()].some((key) => key.endsWith("/.squad/config.json")));
    assert.ok([...writes.values()].some((content) => content.includes('"platform": "ado"')));
    assert.ok([...writes.values()].some((content) => content.includes('"upstreams"')));
    assert.ok([...writes.values()].some((content) => content.includes('"marketplaces"')));
    assert.ok([...writes.values()].some((content) => content.includes('"overrides"')));
  });

  test("applyProfileConfig reports invalid saved profile shape before backup or write", async () => {
    const writeFileStub = sinon.stub().resolves();
    const service = new SquadProfileService({
      backup,
      getWorkspaceRoot: () => vscode.Uri.file(tempDir),
      fileSystem: {
        stat: sinon.stub().resolves(fileStat()),
        readFile: sinon.stub().resolves(encode("{}")),
        createDirectory: sinon.stub().resolves(),
        writeFile: writeFileStub,
      },
      logger: { error: () => undefined, warn: () => undefined } as never,
    });

    const result = await service.applyProfileConfig({ upstreams: "not-array" } as never);

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "invalid-input");
    assert.ok(backupSquadArtifacts.notCalled);
    assert.ok(writeFileStub.notCalled);
  });
});
