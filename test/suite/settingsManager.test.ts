/**
 * Tests for SettingsManager
 * Core configuration management service
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: SettingsManager", () => {
  teardown(async () => {
    // Clean up settings after each test
    const config = vscode.workspace.getConfiguration("nexkit");
    await config.update("workspace.initialized", undefined, vscode.ConfigurationTarget.Workspace);
    await config.update("telemetry.enabled", undefined, vscode.ConfigurationTarget.Global);
    await config.update("mcpSetup.dismissed", undefined, vscode.ConfigurationTarget.Global);
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

  test("Should set MCP setup dismissed status", async () => {
    await SettingsManager.setMcpSetupDismissed(true);
    const isDismissed = SettingsManager.isMcpSetupDismissed();
    assert.strictEqual(isDismissed, true);
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
