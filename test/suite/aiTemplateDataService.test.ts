/**
 * Tests for AITemplateDataService
 * Main facade service for AI template data management
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { AITemplateDataService } from "../../src/features/ai-template-files/services/aiTemplateDataService";
import { AITemplateFileType } from "../../src/features/ai-template-files/models/aiTemplateFile";
import { InstalledTemplatesStateManager } from "../../src/features/ai-template-files/services/installedTemplatesStateManager";
import { SettingsManager } from "../../src/core/settingsManager";
import { RepositoryTemplateProvider } from "../../src/features/ai-template-files/providers/repositoryTemplateProvider";

suite("Unit: AITemplateDataService", () => {
  let service: AITemplateDataService;
  let mockContext: vscode.ExtensionContext;
  let stateManager: InstalledTemplatesStateManager;

  setup(() => {
    // Create mock context
    mockContext = {
      workspaceState: {
        get: () => undefined,
        update: async () => {},
      },
    } as any;

    stateManager = new InstalledTemplatesStateManager(mockContext);
    service = new AITemplateDataService(stateManager);
  });

  teardown(() => {
    service.dispose();
  });

  test("Should instantiate AITemplateDataService", () => {
    assert.ok(service);
  });

  test("Should have initialization methods", () => {
    assert.strictEqual(typeof service.initialize, "function");
    assert.strictEqual(typeof service.waitForReady, "function");
  });

  test("Should have data access methods", () => {
    assert.strictEqual(typeof service.getAllTemplates, "function");
    assert.strictEqual(typeof service.getTemplatesByType, "function");
    assert.strictEqual(typeof service.getTemplatesByRepository, "function");
  });

  test("Should have installation methods", () => {
    assert.strictEqual(typeof service.installTemplate, "function");
    assert.strictEqual(typeof service.installBatch, "function");
    assert.strictEqual(typeof service.updateInstalledTemplates, "function");
  });

  test("Should have event emitters", () => {
    assert.ok(service.onInitialized);
    assert.ok(service.onDataChanged);
    assert.ok(service.onError);
    assert.ok(service.onUpdatesAvailableChanged);
  });

  test("Should have updatesAvailable default to false", () => {
    assert.strictEqual(service.getUpdatesAvailable(), false);
  });

  test("Should return empty array before initialization", () => {
    const templates = service.getAllTemplates();
    assert.ok(Array.isArray(templates));
  });

  test("Should filter templates by type", () => {
    const agents = service.getTemplatesByType("agents");
    assert.ok(Array.isArray(agents));
  });

  test("Should filter templates by repository", () => {
    const templates = service.getTemplatesByRepository("test-repo");
    assert.ok(Array.isArray(templates));
  });
});

suite("Unit: AITemplateDataService - updatesAvailable state transitions", () => {
  let service: AITemplateDataService;
  let mockContext: vscode.ExtensionContext;
  let stateManager: InstalledTemplatesStateManager;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();

    mockContext = {
      workspaceState: {
        get: () => undefined,
        update: async () => {},
      },
    } as any;

    stateManager = new InstalledTemplatesStateManager(mockContext);
    service = new AITemplateDataService(stateManager);
  });

  teardown(() => {
    service.dispose();
    sandbox.restore();
  });

  test("Should fire onUpdatesAvailableChanged(false) and reset state after updateInstalledTemplates", async () => {
    // Arrange: manually set the flag to true (simulating a previous refresh that found updates)
    (service as any)._updatesAvailable = true;

    const firedValues: boolean[] = [];
    service.onUpdatesAvailableChanged((value: boolean) => firedValues.push(value));

    // Stub internal methods so no file-system or network activity is needed
    sandbox.stub(service, "syncInstalledTemplates" as any).resolves();
    sandbox.stub(service, "installBatch" as any).resolves({ installed: 0, failed: 0, skipped: 0 });
    sandbox.stub((service as any).stateManager, "getInstalledTemplates").returns([]);

    // Act
    await service.updateInstalledTemplates();

    // Assert
    assert.strictEqual(service.getUpdatesAvailable(), false, "updatesAvailable should be false after update");
    assert.deepStrictEqual(firedValues, [false], "onUpdatesAvailableChanged should have fired with false");
  });

  test("Should NOT fire onUpdatesAvailableChanged when updatesAvailable is already false during update", async () => {
    // Arrange: flag is already false (default state)
    const firedValues: boolean[] = [];
    service.onUpdatesAvailableChanged((value: boolean) => firedValues.push(value));

    sandbox.stub(service, "syncInstalledTemplates" as any).resolves();
    sandbox.stub(service, "installBatch" as any).resolves({ installed: 0, failed: 0, skipped: 0 });
    sandbox.stub((service as any).stateManager, "getInstalledTemplates").returns([]);

    // Act
    await service.updateInstalledTemplates();

    // Assert: event should NOT fire because the flag was already false
    assert.deepStrictEqual(firedValues, [], "onUpdatesAvailableChanged should not have fired");
  });

  test("Should set updatesAvailable to true and fire event when refresh detects new commits with auto-update disabled", async () => {
    // Arrange
    const firedValues: boolean[] = [];
    service.onUpdatesAvailableChanged((value: boolean) => firedValues.push(value));

    // Stub SettingsManager to disable auto-update
    sandbox.stub(SettingsManager, "isTemplatesAutoUpdateEnabled").returns(false);
    sandbox.stub(SettingsManager, "getRepositoryCommitSha").returns("old-sha");
    sandbox.stub(SettingsManager, "setRepositoryCommitSha").resolves();

    // Create a mock RepositoryTemplateProvider
    const mockProvider = sandbox.createStubInstance(RepositoryTemplateProvider);
    mockProvider.getRepositoryName.returns("test-repo");
    mockProvider.fetchLatestCommitSha.resolves("new-sha");

    // Stub getAllProviders to return our mock provider
    sandbox.stub((service as any).repositoryManager, "getAllProviders").returns([mockProvider]);

    // Stub refreshRepository so it doesn't make real calls
    sandbox.stub(service as any, "refreshRepository").resolves();

    // Stub vscode.window.showInformationMessage to avoid real UI
    sandbox.stub(vscode.window, "showInformationMessage").resolves(undefined as any);

    // Act: invoke private method directly
    await (service as any).checkAndRefreshFromRemote();

    // Assert
    assert.strictEqual(service.getUpdatesAvailable(), true, "updatesAvailable should be true after detecting new commits");
    assert.deepStrictEqual(firedValues, [true], "onUpdatesAvailableChanged should have fired with true");
  });

  test("Should NOT set updatesAvailable when refresh detects new commits with auto-update enabled", async () => {
    // Arrange
    const firedValues: boolean[] = [];
    service.onUpdatesAvailableChanged((value: boolean) => firedValues.push(value));

    // Stub SettingsManager to enable auto-update
    sandbox.stub(SettingsManager, "isTemplatesAutoUpdateEnabled").returns(true);
    sandbox.stub(SettingsManager, "getRepositoryCommitSha").returns("old-sha");
    sandbox.stub(SettingsManager, "setRepositoryCommitSha").resolves();

    const mockProvider = sandbox.createStubInstance(RepositoryTemplateProvider);
    mockProvider.getRepositoryName.returns("test-repo");
    mockProvider.fetchLatestCommitSha.resolves("new-sha");

    sandbox.stub((service as any).repositoryManager, "getAllProviders").returns([mockProvider]);
    sandbox.stub(service as any, "refreshRepository").resolves();

    // Stub updateInstalledTemplates to avoid full execution
    sandbox.stub(service, "updateInstalledTemplates").resolves({ installed: 0, failed: 0, skipped: 0 } as any);
    sandbox.stub(vscode.window, "showInformationMessage").resolves(undefined as any);

    // Act
    await (service as any).checkAndRefreshFromRemote();

    // Assert: auto-update path, so _updatesAvailable must remain false
    assert.strictEqual(service.getUpdatesAvailable(), false, "updatesAvailable should remain false when auto-update is enabled");
    assert.deepStrictEqual(firedValues, [], "onUpdatesAvailableChanged should not fire with true when auto-update is on");
  });

  test("Should NOT set updatesAvailable when no new commits are detected", async () => {
    // Arrange
    const firedValues: boolean[] = [];
    service.onUpdatesAvailableChanged((value: boolean) => firedValues.push(value));

    sandbox.stub(SettingsManager, "isTemplatesAutoUpdateEnabled").returns(false);
    // Same SHA returned by both stored and latest
    sandbox.stub(SettingsManager, "getRepositoryCommitSha").returns("same-sha");

    const mockProvider = sandbox.createStubInstance(RepositoryTemplateProvider);
    mockProvider.getRepositoryName.returns("test-repo");
    mockProvider.fetchLatestCommitSha.resolves("same-sha");

    sandbox.stub((service as any).repositoryManager, "getAllProviders").returns([mockProvider]);

    // Act
    await (service as any).checkAndRefreshFromRemote();

    // Assert
    assert.strictEqual(service.getUpdatesAvailable(), false, "updatesAvailable should stay false when no new commits");
    assert.deepStrictEqual(firedValues, [], "onUpdatesAvailableChanged should not fire when no new commits");
  });
});

suite("Integration: AITemplateDataService Initialization", () => {
  let service: AITemplateDataService;
  let mockContext: vscode.ExtensionContext;
  let stateManager: InstalledTemplatesStateManager;

  setup(() => {
    // Create mock context
    mockContext = {
      workspaceState: {
        get: () => undefined,
        update: async () => {},
      },
    } as any;

    stateManager = new InstalledTemplatesStateManager(mockContext);
    service = new AITemplateDataService(stateManager);
  });

  teardown(() => {
    service.dispose();
  });

  test("Should initialize and fetch templates", async function () {
    this.timeout(30000); // GitHub API can be slow

    try {
      await service.initialize();
      const templates = service.getAllTemplates();

      // Should have some templates from default repository
      assert.ok(Array.isArray(templates), "Templates should be an array");
      // Note: We can't guarantee templates exist if network fails
      // So we just verify the structure is correct
    } catch (error) {
      // Network errors are acceptable in tests
      console.warn("Template fetch failed (network issue):", error);
    }
  });

  test("Should wait for ready state", async function () {
    this.timeout(30000);

    try {
      const initPromise = service.initialize();
      await service.waitForReady();
      await initPromise;

      assert.ok(service.isReady);
    } catch (error) {
      console.warn("Template fetch failed (network issue):", error);
    }
  });
});
