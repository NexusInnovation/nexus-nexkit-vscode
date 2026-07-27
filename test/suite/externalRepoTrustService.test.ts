import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";
import { RepositorySyncRepository } from "../../src/features/repository-sync/models/repositorySyncModels";
import { ExternalRepoTrustService } from "../../src/features/repository-sync/services/externalRepoTrustService";

suite("Unit: ExternalRepoTrustService", () => {
  let sandbox: sinon.SinonSandbox;
  let service: ExternalRepoTrustService;

  const externalRepository: RepositorySyncRepository = {
    key: "external",
    name: "External Repo",
    path: "C:/repos/external",
    source: "external",
    isExternal: true,
  };

  setup(() => {
    sandbox = sinon.createSandbox();
    service = new ExternalRepoTrustService();

    sandbox.stub(SettingsManager, "isRepoSyncAllowExternalRepositories").returns(true);
    sandbox.stub(SettingsManager, "isRepoSyncExternalRepoTrusted").returns(false);
    sandbox.stub(SettingsManager, "isRepoSyncExternalRepoDenied").returns(false);
    sandbox.stub(SettingsManager, "setRepoSyncExternalRepoTrusted").resolves();
    sandbox.stub(SettingsManager, "setRepoSyncExternalRepoDenied").resolves();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("returns true immediately for already trusted repository", async () => {
    (SettingsManager.isRepoSyncExternalRepoTrusted as sinon.SinonStub).returns(true);

    const trusted = await service.isRepositoryTrusted(externalRepository, { interactive: true });

    assert.strictEqual(trusted, true);
  });

  test("persists allow decision", async () => {
    sandbox.stub(vscode.window, "showWarningMessage").resolves("Allow" as any);

    const trusted = await service.isRepositoryTrusted(externalRepository, { interactive: true });

    assert.strictEqual(trusted, true);
    assert.ok((SettingsManager.setRepoSyncExternalRepoTrusted as sinon.SinonStub).calledOnceWith(externalRepository.path, true));
  });

  test("does not persist allow-once decision", async () => {
    sandbox.stub(vscode.window, "showWarningMessage").resolves("Allow Once" as any);

    const trusted = await service.isRepositoryTrusted(externalRepository, { interactive: true });

    assert.strictEqual(trusted, true);
    assert.ok((SettingsManager.setRepoSyncExternalRepoTrusted as sinon.SinonStub).notCalled);
    assert.ok((SettingsManager.setRepoSyncExternalRepoDenied as sinon.SinonStub).notCalled);
  });

  test("persists deny decision", async () => {
    sandbox.stub(vscode.window, "showWarningMessage").resolves("Deny" as any);

    const trusted = await service.isRepositoryTrusted(externalRepository, { interactive: true });

    assert.strictEqual(trusted, false);
    assert.ok((SettingsManager.setRepoSyncExternalRepoDenied as sinon.SinonStub).calledOnceWith(externalRepository.path, true));
  });
});
