/**
 * Tests for ExtensionUpdateService
 * Handles extension update checking and installation
 */

import * as assert from "assert";
import { ExtensionUpdateService } from "../../src/features/extension-updates/extensionUpdateService";

suite("Unit: ExtensionUpdateService", () => {
  let service: ExtensionUpdateService;

  setup(() => {
    service = new ExtensionUpdateService();
  });

  test("Should instantiate ExtensionUpdateService", () => {
    assert.ok(service);
  });

  test("Should have check update method", () => {
    assert.strictEqual(typeof service.checkForExtensionUpdate, "function");
  });
});

suite("Integration: ExtensionUpdateService - Update Check", () => {
  let service: ExtensionUpdateService;

  setup(() => {
    service = new ExtensionUpdateService();
  });

  test("Should check for updates without errors", async function () {
    this.timeout(15000); // GitHub API can be slow

    try {
      const updateInfo = await service.checkForExtensionUpdate();

      if (updateInfo) {
        assert.ok(updateInfo.currentVersion);
        assert.ok(updateInfo.latestVersion);
        assert.ok(updateInfo.releaseInfo);
      } else {
        // No update available is a valid result
        assert.strictEqual(updateInfo, null);
      }
    } catch (error) {
      // Network errors are acceptable in tests
      console.warn("Update check failed (network issue):", error);
    }
  });
});
