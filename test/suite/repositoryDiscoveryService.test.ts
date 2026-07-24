import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";
import { RepositoryDiscoveryService } from "../../src/features/repository-sync/services/repositoryDiscoveryService";

suite("Unit: RepositoryDiscoveryService", () => {
  let sandbox: sinon.SinonSandbox;
  let tempRoot: string;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-repo-discovery-"));
  });

  teardown(() => {
    sandbox.restore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("collects workspace, external and root-scan repositories and deduplicates by normalized path", async () => {
    const workspaceRepo = path.join(tempRoot, "workspace-repo");
    const externalRepo = path.join(tempRoot, "external-repo");
    const rootScanRoot = path.join(tempRoot, "scan-root");
    const rootScannedRepo = path.join(rootScanRoot, "nested-repo");

    fs.mkdirSync(path.join(workspaceRepo, ".git"), { recursive: true });
    fs.mkdirSync(path.join(externalRepo, ".git"), { recursive: true });
    fs.mkdirSync(path.join(rootScannedRepo, ".git"), { recursive: true });

    sandbox.stub(vscode.workspace, "workspaceFolders").value([
      { uri: vscode.Uri.file(workspaceRepo), name: "Workspace Repo", index: 0 },
    ]);
    sandbox.stub(SettingsManager, "getRepoSyncExternalRepositories").returns([
      externalRepo,
      workspaceRepo,
    ]);
    sandbox.stub(SettingsManager, "getRepoSyncScanRootPaths").returns([rootScanRoot]);
    sandbox.stub(SettingsManager, "getRepoSyncScanMaxDepth").returns(2);
    sandbox.stub(SettingsManager, "getRepoSyncScanMaxRepositories").returns(100);
    sandbox.stub(SettingsManager, "isRepoSyncScanWatchEnabled").returns(false);

    const service = new RepositoryDiscoveryService();
    const result = await service.getSyncableRepositories();

    const byPath = new Map(result.map((repo) => [repo.path, repo]));

    assert.strictEqual(result.length, 3);
    assert.strictEqual(byPath.get(path.normalize(workspaceRepo).toLowerCase())?.source, "workspace");
    assert.strictEqual(byPath.get(path.normalize(externalRepo).toLowerCase())?.source, "external");
    assert.strictEqual(byPath.get(path.normalize(rootScannedRepo).toLowerCase())?.source, "root-scan");

    service.dispose();
  });

  test("respects scan max depth while scanning root paths", async () => {
    const rootScanRoot = path.join(tempRoot, "scan-root");
    const depthOneRepo = path.join(rootScanRoot, "level1");
    const depthThreeRepo = path.join(rootScanRoot, "a", "b", "c");

    fs.mkdirSync(path.join(depthOneRepo, ".git"), { recursive: true });
    fs.mkdirSync(path.join(depthThreeRepo, ".git"), { recursive: true });

    sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);
    sandbox.stub(SettingsManager, "getRepoSyncExternalRepositories").returns([]);
    sandbox.stub(SettingsManager, "getRepoSyncScanRootPaths").returns([rootScanRoot]);
    sandbox.stub(SettingsManager, "getRepoSyncScanMaxDepth").returns(2);
    sandbox.stub(SettingsManager, "getRepoSyncScanMaxRepositories").returns(100);
    sandbox.stub(SettingsManager, "isRepoSyncScanWatchEnabled").returns(false);

    const service = new RepositoryDiscoveryService();
    const result = await service.getSyncableRepositories();

    assert.strictEqual(result.some((repo) => repo.path === path.normalize(depthOneRepo).toLowerCase()), true);
    assert.strictEqual(result.some((repo) => repo.path === path.normalize(depthThreeRepo).toLowerCase()), false);

    service.dispose();
  });
});
