/**
 * Tests for WorkspaceInitializationService
 * Verifies that settings.json writes only occur from the sanctioned initialization entry point
 * and that the caller="initialization" identifier is used when invoking deployVscodeSettings.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { WorkspaceInitializationService } from "../../src/features/initialization/workspaceInitializationService";
import { SettingsManager } from "../../src/core/settingsManager";
import { ServiceContainer } from "../../src/core/serviceContainer";

suite("Unit: WorkspaceInitializationService", () => {
  let service: WorkspaceInitializationService;
  let sandbox: sinon.SinonSandbox;
  let mockServices: Partial<ServiceContainer>;
  let deployVscodeSettingsStub: sinon.SinonStub;
  let notifyWorkspaceInitializedSpy: sinon.SinonStub;

  const fakeWorkspaceFolder: vscode.WorkspaceFolder = {
    uri: vscode.Uri.file("/fake/workspace"),
    name: "test-workspace",
    index: 0,
  };

  setup(() => {
    sandbox = sinon.createSandbox();

    deployVscodeSettingsStub = sandbox.stub().resolves();
    notifyWorkspaceInitializedSpy = sandbox.stub();

    mockServices = {
      startupVerification: {
        verifyWorkspaceConfiguration: sandbox.stub().resolves(null),
        verifyOnStartup: sandbox.stub().resolves(),
      } as any,
      backup: {
        backupTemplates: sandbox.stub().resolves(null),
      } as any,
      recommendedExtensionsConfigDeployer: {
        deployVscodeExtensions: sandbox.stub().resolves(),
      } as any,
      mcpConfigDeployer: {
        deployWorkspaceMCPServers: sandbox.stub().resolves(),
      } as any,
      recommendedSettingsConfigDeployer: {
        deployVscodeSettings: deployVscodeSettingsStub,
      } as any,
      aiTemplateFilesDeployer: {
        deployTemplateFiles: sandbox.stub().resolves({ installedCount: 0, skippedCount: 0, failedFiles: [] }),
      } as any,
      profileService: {
        applyProfile: sandbox.stub().resolves({ summary: { installedCount: 0, skippedCount: 0, failedFiles: [] } }),
      } as any,
      workspaceInitialization: {
        notifyWorkspaceInitialized: notifyWorkspaceInitializedSpy,
        onWorkspaceInitialized: new vscode.EventEmitter<void>().event,
      } as any,
    };

    sandbox.stub(SettingsManager, "isUserDeployMode").returns(false);
    sandbox.stub(SettingsManager, "setWorkspaceInitialized").resolves();

    service = new WorkspaceInitializationService();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Should instantiate WorkspaceInitializationService", () => {
    assert.ok(service);
  });

  test("initializeWorkspace should call deployVscodeSettings with caller='initialization'", async () => {
    await service.initializeWorkspace(fakeWorkspaceFolder, null, mockServices as ServiceContainer);

    assert.ok(deployVscodeSettingsStub.calledOnce, "deployVscodeSettings should be called during initializeWorkspace");
    assert.strictEqual(
      deployVscodeSettingsStub.firstCall.args[0],
      fakeWorkspaceFolder.uri.fsPath,
      "Should pass workspace root as first argument"
    );
    assert.strictEqual(
      deployVscodeSettingsStub.firstCall.args[1],
      "initialization",
      "caller must be 'initialization' — sanctioned entry point identifier"
    );
  });

  test("initializeWorkspace should call deployVscodeSettings even without a profile", async () => {
    await service.initializeWorkspace(fakeWorkspaceFolder, null, mockServices as ServiceContainer);

    assert.ok(deployVscodeSettingsStub.calledOnce, "deployVscodeSettings should be called regardless of profile selection");
  });

  test("initializeWorkspace should call deployVscodeSettings when a profile is selected", async () => {
    await service.initializeWorkspace(fakeWorkspaceFolder, "myProfile", mockServices as ServiceContainer);

    assert.ok(deployVscodeSettingsStub.calledOnce, "deployVscodeSettings should be called even when a profile is provided");
  });

  test("initializeWorkspace should notify workspace initialized after completion", async () => {
    await service.initializeWorkspace(fakeWorkspaceFolder, null, mockServices as ServiceContainer);

    assert.ok(notifyWorkspaceInitializedSpy.calledOnce, "Should fire workspaceInitialized event after init");
  });
});
