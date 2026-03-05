/**
 * Tests for NexkitFileWatcherService
 * Tests the file system watcher service that monitors .nexkit/ directory
 * for external changes and provides rollback + user confirmation functionality
 */

import * as assert from "assert";
import { NexkitFileWatcherService } from "../../src/features/nexkit-file-watcher/nexkitFileWatcherService";

suite("Unit: NexkitFileWatcherService", function () {
  let service: NexkitFileWatcherService;

  setup(() => {
    // Get a fresh singleton instance
    service = NexkitFileWatcherService.getInstance();
  });

  teardown(() => {
    // Dispose clears the singleton, so next test gets a fresh instance
    service?.dispose();
  });

  test("Should instantiate via singleton pattern", () => {
    assert.ok(service, "Service should be instantiated");
    const same = NexkitFileWatcherService.getInstance();
    assert.strictEqual(service, same, "getInstance should return the same instance");
  });

  test("Should have startWatching method", () => {
    assert.strictEqual(typeof service.startWatching, "function", "Should have startWatching method");
  });

  test("Should have suppressPath method", () => {
    assert.strictEqual(typeof service.suppressPath, "function", "Should have suppressPath method");
  });

  test("Should have beginBulkOperation method", () => {
    assert.strictEqual(typeof service.beginBulkOperation, "function", "Should have beginBulkOperation method");
  });

  test("Should have endBulkOperation method", () => {
    assert.strictEqual(typeof service.endBulkOperation, "function", "Should have endBulkOperation method");
  });

  test("Should have dispose method", () => {
    assert.strictEqual(typeof service.dispose, "function", "Should have dispose method");
  });

  test("Should properly dispose without errors", () => {
    assert.doesNotThrow(() => {
      service.dispose();
    }, "Disposal should not throw errors");
  });

  test("Should handle multiple disposals gracefully", () => {
    assert.doesNotThrow(() => {
      service.dispose();
      service.dispose();
    }, "Multiple disposals should not throw errors");
  });

  test("Should create new instance after dispose", () => {
    service.dispose();
    const newInstance = NexkitFileWatcherService.getInstance();
    assert.ok(newInstance, "Should create a new instance after dispose");
    assert.notStrictEqual(service, newInstance, "New instance should be different from disposed one");
    newInstance.dispose();
  });

  test("Should not throw when suppressPath is called before startWatching", () => {
    assert.doesNotThrow(() => {
      service.suppressPath("/some/path/file.md");
    }, "suppressPath should not throw before watcher is started");
  });

  test("Should not throw when beginBulkOperation is called before startWatching", () => {
    assert.doesNotThrow(() => {
      service.beginBulkOperation();
    }, "beginBulkOperation should not throw before watcher is started");
  });

  test("Should not throw when endBulkOperation is called before startWatching", async () => {
    await assert.doesNotReject(async () => {
      await service.endBulkOperation();
    }, "endBulkOperation should not throw before watcher is started");
  });

  test("Should handle nested bulk operations correctly", async () => {
    // Begin twice, end twice - should not throw
    await assert.doesNotReject(async () => {
      service.beginBulkOperation();
      service.beginBulkOperation();
      await service.endBulkOperation();
      await service.endBulkOperation();
    }, "Nested bulk operations should not throw");
  });

  test("Should handle extra endBulkOperation calls gracefully", async () => {
    // End without begin should not throw (depth goes to 0 minimum)
    await assert.doesNotReject(async () => {
      await service.endBulkOperation();
      await service.endBulkOperation();
    }, "Extra endBulkOperation calls should not throw");
  });

  test("Should handle startWatching without workspace folder", async () => {
    // In test environment, no workspace folders are typically open
    // startWatching should handle this gracefully
    await assert.doesNotReject(async () => {
      await service.startWatching();
    }, "startWatching should not throw when no workspace folder is open");
  });
});
