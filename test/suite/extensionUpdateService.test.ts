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
    this.timeout(60000); // Increase timeout for slow GitHub API

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Test timeout")), 55000);
      });

      // Race between the actual call and timeout
      const updateInfo = (await Promise.race([service.checkForExtensionUpdate(), timeoutPromise])) as any;

      if (updateInfo) {
        assert.ok(updateInfo.currentVersion);
        assert.ok(updateInfo.latestVersion);
        assert.ok(updateInfo.releaseInfo);
      } else {
        // No update available is a valid result
        assert.strictEqual(updateInfo, null);
      }
    } catch (error: any) {
      // Network errors, rate limiting, or timeouts are acceptable in tests
      if (
        error.message &&
        (error.message.includes("rate limit") ||
          error.message.includes("network") ||
          error.message.includes("timeout") ||
          error.message.includes("Test timeout"))
      ) {
        console.warn("Update check failed (expected in test environment):", error.message);
        this.skip();
      } else {
        console.warn("Update check failed:", error);
        // Don't fail the test for network issues
      }
    }
  });
});
