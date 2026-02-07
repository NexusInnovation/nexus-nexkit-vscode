/**
 * Tests for NexkitResetService
 * Reset functionality to restore initial installation state
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { NexkitResetService } from "../../src/features/reset/nexkitResetService";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: NexkitResetService", () => {
  let resetService: NexkitResetService;
  let mockContext: vscode.ExtensionContext;
  let globalStateData: Map<string, any>;
  let workspaceStateData: Map<string, any>;
  let showWarningMessageStub: sinon.SinonStub;

  setup(() => {
    // Create mock state stores
    globalStateData = new Map<string, any>();
    workspaceStateData = new Map<string, any>();

    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: (key: string, defaultValue?: any) => {
          return workspaceStateData.has(key) ? workspaceStateData.get(key) : defaultValue;
        },
        update: async (key: string, value: any) => {
          workspaceStateData.set(key, value);
        },
        keys: () => Array.from(workspaceStateData.keys()),
      },
      globalState: {
        get: (key: string, defaultValue?: any) => {
          return globalStateData.has(key) ? globalStateData.get(key) : defaultValue;
        },
        update: async (key: string, value: any) => {
          globalStateData.set(key, value);
        },
        keys: () => Array.from(globalStateData.keys()),
        setKeysForSync: () => {},
      },
      extensionUri: vscode.Uri.file(__dirname),
      extensionPath: __dirname,
      asAbsolutePath: (relativePath: string) => `${__dirname}/${relativePath}`,
      storagePath: undefined,
      globalStoragePath: __dirname,
      logPath: __dirname,
      extensionMode: vscode.ExtensionMode.Test,
    } as any;

    // Initialize SettingsManager with mock context
    SettingsManager.initialize(mockContext);

    resetService = new NexkitResetService();

    // Create stub for VS Code API
    showWarningMessageStub = sinon.stub(vscode.window, "showWarningMessage");
  });

  teardown(async () => {
    // Restore stubs
    showWarningMessageStub.restore();

    // Clean up global settings
    const config = vscode.workspace.getConfiguration("nexkit");
    await config.update("userMode", undefined, vscode.ConfigurationTarget.Global);
    await config.update("mcpSetup.dismissed", undefined, vscode.ConfigurationTarget.Global);

    // Clear state stores
    globalStateData.clear();
    workspaceStateData.clear();
  });

  test("Should clear all workspace state on reset", async function () {
    // Add some test data to workspace state
    workspaceStateData.set("testKey1", "testValue1");
    workspaceStateData.set("testKey2", "testValue2");
    workspaceStateData.set("workspaceInitialized", true);

    assert.strictEqual(workspaceStateData.size, 3, "Should have 3 items before reset");

    await resetService.resetToInitialState(mockContext);

    // Verify all workspace state is cleared
    assert.strictEqual(workspaceStateData.size, 0, "All workspace state should be cleared");
  });

  test("Should clear all global state on reset", async function () {
    // Add some test data to global state
    globalStateData.set("testGlobalKey1", "value1");
    globalStateData.set("testGlobalKey2", "value2");
    globalStateData.set("nexkit.firstTimeUser", false);

    assert.strictEqual(globalStateData.size, 3, "Should have 3 items before reset");

    await resetService.resetToInitialState(mockContext);

    // Verify all global state is cleared
    assert.strictEqual(globalStateData.size, 0, "All global state should be cleared");
  });

  test("Should reset first time user flag to true", async function () {
    // Set first time user to false
    await SettingsManager.setFirstTimeUser(false);
    assert.strictEqual(SettingsManager.isFirstTimeUser(), false);

    await resetService.resetToInitialState(mockContext);

    // Should be reset to true
    assert.strictEqual(SettingsManager.isFirstTimeUser(), true);
  });

  test("Should reset workspace initialized flag", async function () {
    // Set workspace as initialized
    await SettingsManager.setWorkspaceInitialized(true);
    assert.strictEqual(SettingsManager.isWorkspaceInitialized(), true);

    await resetService.resetToInitialState(mockContext);

    // Should be reset to false
    assert.strictEqual(SettingsManager.isWorkspaceInitialized(), false);
  });

  test("Should reset workspace init prompt dismissed flag", async function () {
    // Dismiss the prompt
    await SettingsManager.setWorkspaceInitPromptDismissed(true);
    assert.strictEqual(SettingsManager.isWorkspaceInitPromptDismissed(), true);

    await resetService.resetToInitialState(mockContext);

    // Should be reset to false
    assert.strictEqual(SettingsManager.isWorkspaceInitPromptDismissed(), false);
  });

  test("Should reset user mode to notset", async function () {
    // Try to set mode (may fail if setting is not registered in test environment)
    try {
      await SettingsManager.setUserMode("Developer");
      await resetService.resetToInitialState(mockContext);
      const mode = SettingsManager.getUserMode();
      assert.strictEqual(mode, "notset");
    } catch (error: any) {
      if (error.message && error.message.includes("not a registered configuration")) {
        this.skip();
      } else {
        throw error;
      }
    }
  });

  test("Should prompt user for confirmation", async function () {
    showWarningMessageStub.resolves("Yes, Reset");

    const confirmed = await resetService.confirmReset();

    assert.strictEqual(confirmed, true);
    assert.ok(showWarningMessageStub.calledOnce, "Should show warning message once");
  });

  test("Should return false if user cancels confirmation", async function () {
    showWarningMessageStub.resolves("Cancel");

    const confirmed = await resetService.confirmReset();

    assert.strictEqual(confirmed, false);
  });

  test("Should return false if user dismisses confirmation", async function () {
    showWarningMessageStub.resolves(undefined);

    const confirmed = await resetService.confirmReset();

    assert.strictEqual(confirmed, false);
  });

  test("Should handle errors during reset gracefully", async function () {
    // Create a mock context that will throw an error
    const errorContext = {
      ...mockContext,
      workspaceState: {
        ...mockContext.workspaceState,
        keys: () => {
          throw new Error("Test error");
        },
      },
    } as any;

    try {
      await resetService.resetToInitialState(errorContext);
      assert.fail("Should have thrown an error");
    } catch (error: any) {
      assert.ok(error instanceof Error);
      assert.strictEqual(error.message, "Test error");
    }
  });
});
