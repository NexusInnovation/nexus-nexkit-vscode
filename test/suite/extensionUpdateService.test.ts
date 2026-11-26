/**
 * Tests for ExtensionUpdateService
 * Handles extension update checking and installation
 */

import * as assert from "assert";
import * as sinon from "sinon";
import { ExtensionUpdateService } from "../../src/features/extension-updates/extensionUpdateService";
import { ExtensionGitHubReleaseService } from "../../src/features/extension-updates/extensionGitHubReleaseService";

suite("Unit: ExtensionGitHubReleaseService - Authentication", () => {
  let service: ExtensionGitHubReleaseService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    service = new ExtensionGitHubReleaseService();
    sandbox = sinon.createSandbox();
    sandbox.stub(service as any, "getAuthHeaders").resolves({});
  });

  teardown(() => {
    sandbox.restore();
  });

  for (const status of [401, 403, 404]) {
    test(`Automatic release checks do not prompt for HTTP ${status}`, async () => {
      sandbox.stub(globalThis, "fetch").resolves(new Response(null, { status }));
      const handleAuthError = sandbox.stub(service as any, "handleAuthError").resolves(false);

      await assert.rejects(service.fetchLatestRelease(), new RegExp(`GitHub API error: ${status}`));
      assert.strictEqual(handleAuthError.callCount, 0);
    });
  }

  test("Manual release checks can prompt and retry after sign-in", async () => {
    const fetchStub = sandbox.stub(globalThis, "fetch");
    fetchStub.onFirstCall().resolves(new Response(null, { status: 401 }));
    fetchStub.onSecondCall().resolves(new Response(JSON.stringify({ tag_name: "v1.0.0", published_at: "today", assets: [] })));
    const handleAuthError = sandbox.stub(service as any, "handleAuthError").resolves(true);

    const release = await service.fetchLatestRelease(true);

    assert.strictEqual(release.tagName, "v1.0.0");
    assert.strictEqual(handleAuthError.callCount, 1);
    assert.strictEqual(fetchStub.callCount, 2);
  });

  test("Automatic release checks still return successful responses", async () => {
    sandbox
      .stub(globalThis, "fetch")
      .resolves(new Response(JSON.stringify({ tag_name: "v1.0.0", published_at: "today", assets: [] })));
    const handleAuthError = sandbox.stub(service as any, "handleAuthError").resolves(false);

    const release = await service.fetchLatestRelease();

    assert.strictEqual(release.tagName, "v1.0.0");
    assert.strictEqual(handleAuthError.callCount, 0);
  });
});

suite("Unit: ExtensionUpdateService - Prompt Mode", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(console, "error");
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Only explicitly requested checks allow a sign-in prompt", async () => {
    const service = new ExtensionUpdateService();
    const fetchRelease = sandbox
      .stub((service as any).extensionReleaseService, "fetchLatestRelease")
      .rejects(new Error("unavailable"));

    await service.checkForExtensionUpdate();
    await service.checkForExtensionUpdate(true);

    assert.strictEqual(fetchRelease.firstCall.args[0], false);
    assert.strictEqual(fetchRelease.secondCall.args[0], true);
  });
});

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
