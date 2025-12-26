/**
 * Tests for ServiceContainer
 * Dependency injection container
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { initializeServices, ServiceContainer } from "../../src/core/serviceContainer";

suite("Unit: ServiceContainer", () => {
  let context: vscode.ExtensionContext;
  let services: ServiceContainer;

  setup(async function () {
    // Increase timeout for initialization
    this.timeout(15000);

    // Create mock context
    context = {
      subscriptions: [],
      workspaceState: {
        get: () => undefined,
        update: async () => {},
      },
      globalState: {
        get: () => undefined,
        update: async () => {},
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

    services = await initializeServices(context);
  });

  teardown(() => {
    // Dispose services
    if (services.telemetry) {
      services.telemetry.dispose();
    }
    if (services.aiTemplateData) {
      services.aiTemplateData.dispose();
    }
  });

  test("Should initialize all required services", () => {
    assert.ok(services.telemetry, "TelemetryService should be initialized");
    assert.ok(services.mcpConfig, "MCPConfigService should be initialized");
    assert.ok(services.aiTemplateData, "AITemplateDataService should be initialized");
    assert.ok(services.installedTemplatesState, "InstalledTemplatesStateManager should be initialized");
    assert.ok(services.updateStatusBar, "UpdateStatusBarService should be initialized");
    assert.ok(services.extensionUpdate, "ExtensionUpdateService should be initialized");
    assert.ok(services.backup, "BackupService should be initialized");
    assert.ok(services.gitIgnoreConfigDeployer, "GitIgnoreConfigDeployer should be initialized");
    assert.ok(services.mcpConfigDeployer, "MCPConfigDeployer should be initialized");
    assert.ok(services.recommendedExtensionsConfigDeployer, "RecommendedExtensionsConfigDeployer should be initialized");
    assert.ok(services.recommendedSettingsConfigDeployer, "RecommendedSettingsConfigDeployer should be initialized");
    assert.ok(services.aiTemplateFilesDeployer, "AITemplateFilesDeployer should be initialized");
    assert.ok(services.workspaceInitPrompt, "WorkspaceInitPromptService should be initialized");
  });

  test("Should register disposables in context", () => {
    assert.ok(context.subscriptions.length > 0, "At least one disposable should be registered");
  });
});
