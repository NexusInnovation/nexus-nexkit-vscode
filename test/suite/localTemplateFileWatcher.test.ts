/**
 * Tests for Local Template File Watching
 * Tests the file system watcher functionality for local folder repositories
 */

import * as assert from "assert";
import { AITemplateDataService } from "../../src/features/ai-template-files/services/aiTemplateDataService";
import { InstalledTemplatesStateManager } from "../../src/features/ai-template-files/services/installedTemplatesStateManager";

suite("Unit: Local Template File Watching", function () {
  let service: AITemplateDataService;
  let mockContext: any;
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
    service?.dispose();
  });

  test("Should have file watching infrastructure in place", () => {
    // Verify that the service has the methods needed for file watching
    // This is a structural test to ensure the implementation is present
    assert.ok(service, "Service should be instantiated");
    assert.strictEqual(typeof service.initialize, "function", "Should have initialize method");
    assert.strictEqual(typeof service.dispose, "function", "Should have dispose method");
  });

  test("Should properly dispose file watchers on disposal", () => {
    // Ensure disposal doesn't throw errors (file watchers are cleaned up)
    assert.doesNotThrow(() => {
      service.dispose();
    }, "Disposal should not throw errors");
  });

  test("Should handle multiple disposals gracefully", () => {
    // Dispose multiple times should not cause issues
    assert.doesNotThrow(() => {
      service.dispose();
      service.dispose();
    }, "Multiple disposals should not throw errors");
  });

  test("Should have configuration change watcher support", () => {
    assert.strictEqual(typeof service.setupConfigurationWatcher, "function", "Should have setupConfigurationWatcher method");
  });

  test("Should have refresh capability", () => {
    assert.strictEqual(typeof service.refresh, "function", "Should have refresh method for updating templates");
  });
});
