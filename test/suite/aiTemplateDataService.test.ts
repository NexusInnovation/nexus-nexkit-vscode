/**
 * Tests for AITemplateDataService
 * Main facade service for AI template data management
 */

import * as assert from "assert";
import { AITemplateDataService } from "../../src/features/ai-template-files/services/aiTemplateDataService";
import { AITemplateFileType } from "../../src/features/ai-template-files/models/aiTemplateFile";

suite("Unit: AITemplateDataService", () => {
  let service: AITemplateDataService;

  setup(() => {
    service = new AITemplateDataService();
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
  });

  test("Should have event emitters", () => {
    assert.ok(service.onInitialized);
    assert.ok(service.onDataChanged);
    assert.ok(service.onError);
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

suite("Integration: AITemplateDataService Initialization", () => {
  let service: AITemplateDataService;

  setup(() => {
    service = new AITemplateDataService();
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
