/**
 * Tests for Update Installed Templates command
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { AITemplateDataService } from "../../src/features/ai-template-files/services/aiTemplateDataService";
import { InstalledTemplatesStateManager } from "../../src/features/ai-template-files/services/installedTemplatesStateManager";
import { AITemplateFileType } from "../../src/features/ai-template-files/models/aiTemplateFile";

suite("Unit: UpdateInstalledTemplates Command", () => {
  let service: AITemplateDataService;
  let mockContext: vscode.ExtensionContext;
  let stateManager: InstalledTemplatesStateManager;

  setup(() => {
    // Create mock context
    mockContext = {
      workspaceState: {
        get: () => ({
          version: 1,
          templates: [],
        }),
        update: async () => {},
      },
    } as any;

    stateManager = new InstalledTemplatesStateManager(mockContext);
    service = new AITemplateDataService(stateManager);
  });

  teardown(() => {
    service.dispose();
  });

  test("Should have updateInstalledTemplates method", () => {
    assert.strictEqual(typeof service.updateInstalledTemplates, "function");
  });

  test("Should return summary with skipped count", async () => {
    // This is a unit test to verify the method exists and returns expected structure
    // Full integration testing requires a workspace and file system
    const result = await service.updateInstalledTemplates();

    assert.ok(result);
    assert.ok(typeof result.installed === "number");
    assert.ok(typeof result.failed === "number");
    assert.ok(typeof result.skipped === "number");
    assert.ok(result.types);
  });

  test("Should sync with filesystem before updating", async () => {
    let syncCalled = false;
    const originalSync = service.syncInstalledTemplates.bind(service);

    // Monkey patch to track calls
    service.syncInstalledTemplates = async () => {
      syncCalled = true;
      await originalSync();
    };

    await service.updateInstalledTemplates();

    assert.strictEqual(syncCalled, true, "syncInstalledTemplates should be called before updating");
  });
});

suite("Integration: UpdateInstalledTemplates Workflow", () => {
  let service: AITemplateDataService;
  let mockContext: vscode.ExtensionContext;
  let stateManager: InstalledTemplatesStateManager;

  setup(() => {
    // Create mock context with some installed templates
    mockContext = {
      workspaceState: {
        get: () => ({
          version: 1,
          templates: [
            {
              name: "test-agent.md",
              type: "agents" as AITemplateFileType,
              repository: "nexus-nexkit-templates",
              repositoryUrl: "https://github.com/test/test",
              rawUrl: "https://raw.githubusercontent.com/test/test/main/agents/test-agent.md",
              installedAt: Date.now(),
            },
          ],
        }),
        update: async () => {},
      },
    } as any;

    stateManager = new InstalledTemplatesStateManager(mockContext);
    service = new AITemplateDataService(stateManager);
  });

  teardown(() => {
    service.dispose();
  });

  test("Should handle templates that are no longer available", async function () {
    this.timeout(30000);

    // Initialize service to fetch templates
    await service.initialize();

    // Update should skip templates not found in current repos
    const result = await service.updateInstalledTemplates();

    // Verify the result structure
    assert.ok(typeof result.installed === "number");
    assert.ok(typeof result.failed === "number");
    assert.ok(typeof result.skipped === "number");
  });
});
