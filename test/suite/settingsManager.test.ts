/**
 * Tests for SettingsManager
 * Core configuration management service
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: SettingsManager", () => {
  let mockContext: vscode.ExtensionContext;
  let globalStateData: Map<string, any>;
  let workspaceStateData: Map<string, any>;

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
      },
      globalState: {
        get: (key: string, defaultValue?: any) => {
          return globalStateData.has(key) ? globalStateData.get(key) : defaultValue;
        },
        update: async (key: string, value: any) => {
          globalStateData.set(key, value);
        },
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
  });

  teardown(async () => {
    // Clean up global settings only (no workspace in tests)
    const config = vscode.workspace.getConfiguration("nexkit");
    await config.update("mcpSetup.dismissed", undefined, vscode.ConfigurationTarget.Global);

    // Clear state stores
    globalStateData.clear();
    workspaceStateData.clear();
  });

  test("Should get workspace initialized status", () => {
    const isInitialized = SettingsManager.isWorkspaceInitialized();
    assert.strictEqual(typeof isInitialized, "boolean");
  });

  test("Should set workspace initialized status", async () => {
    await SettingsManager.setWorkspaceInitialized(true);
    const isInitialized = SettingsManager.isWorkspaceInitialized();
    assert.strictEqual(isInitialized, true);
  });

  test("Should get telemetry enabled status", () => {
    const isEnabled = SettingsManager.isNexkitTelemetryEnabled();
    assert.strictEqual(typeof isEnabled, "boolean");
  });

  test("Should get repositories configuration", () => {
    const repos = SettingsManager.getRepositories();
    assert.ok(Array.isArray(repos));
  });

  test("Should get MCP setup dismissed status", () => {
    const isDismissed = SettingsManager.isMcpSetupDismissed();
    assert.strictEqual(typeof isDismissed, "boolean");
  });

  test("Should set MCP setup dismissed status", async function () {
    // Skip this test in CI or when extension configuration is not registered
    try {
      await SettingsManager.setMcpSetupDismissed(true);
      const isDismissed = SettingsManager.isMcpSetupDismissed();
      assert.strictEqual(isDismissed, true);
    } catch (error: any) {
      if (error.message && error.message.includes("not a registered configuration")) {
        this.skip();
      } else {
        throw error;
      }
    }
  });

  test("Should get update check interval", () => {
    const interval = SettingsManager.getUpdateCheckIntervalHours();
    assert.strictEqual(typeof interval, "number");
    assert.ok(interval > 0);
  });

  test("Should get and set last update check timestamp", async () => {
    const now = Date.now();
    await SettingsManager.setLastUpdateCheck(now);
    const timestamp = SettingsManager.getLastUpdateCheck();
    assert.strictEqual(timestamp, now);
  });
});
