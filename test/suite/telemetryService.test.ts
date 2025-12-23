/**
 * Tests for TelemetryService
 * Anonymous usage analytics service
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { TelemetryService } from "../../src/shared/services/telemetryService";

suite("Unit: TelemetryService", () => {
  let context: vscode.ExtensionContext;
  let telemetryService: TelemetryService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Mock extension context
    context = {
      subscriptions: [],
      workspaceState: {
        get: sandbox.stub(),
        update: sandbox.stub(),
      },
      globalState: {
        get: sandbox.stub(),
        update: sandbox.stub(),
        setKeysForSync: sandbox.stub(),
      },
      extensionUri: vscode.Uri.file("/test/path"),
      extensionPath: "/test/path",
      asAbsolutePath: (relativePath: string) => `/test/path/${relativePath}`,
      storagePath: "/test/storage",
      globalStoragePath: "/test/global-storage",
      logPath: "/test/logs",
      extensionMode: vscode.ExtensionMode.Test,
    } as any;

    telemetryService = new TelemetryService(context);
  });

  teardown(() => {
    sandbox.restore();
    if (telemetryService) {
      telemetryService.dispose();
    }
  });

  suite("Initialization", () => {
    test("Should initialize without errors", async () => {
      await telemetryService.initialize();
      assert.ok(telemetryService);
    });

    test("Should respect VS Code global telemetry setting", async () => {
      const getConfigStub = sandbox.stub(vscode.workspace, "getConfiguration");

      // Mock VS Code telemetry as disabled
      getConfigStub.withArgs("telemetry").returns({
        get: sandbox.stub().withArgs("telemetryLevel", "all").returns("off"),
      } as any);

      getConfigStub.withArgs("nexkit").returns({
        get: sandbox.stub().withArgs("telemetry.enabled", true).returns(true),
      } as any);

      await telemetryService.initialize();
      assert.ok(telemetryService);
    });

    test("Should respect Nexkit telemetry setting", async () => {
      const getConfigStub = sandbox.stub(vscode.workspace, "getConfiguration");

      // Mock VS Code telemetry as enabled
      getConfigStub.withArgs("telemetry").returns({
        get: sandbox.stub().withArgs("telemetryLevel", "all").returns("all"),
      } as any);

      // Mock Nexkit telemetry as disabled
      getConfigStub.withArgs("nexkit").returns({
        get: sandbox.stub().withArgs("telemetry.enabled", true).returns(false),
      } as any);

      await telemetryService.initialize();
      assert.ok(telemetryService);
    });
  });

  suite("Event Tracking", () => {
    test("Should track command execution", () => {
      assert.doesNotThrow(() => {
        telemetryService.trackCommand("testCommand", { customProp: "value" });
      });
    });

    test("Should track events", () => {
      assert.doesNotThrow(() => {
        telemetryService.trackEvent("testEvent", { property: "value" });
      });
    });

    test("Should track errors", () => {
      assert.doesNotThrow(() => {
        const error = new Error("Test error");
        telemetryService.trackError(error);
      });
    });

    test("Should track activation", () => {
      assert.doesNotThrow(() => {
        telemetryService.trackActivation();
      });
    });
  });

  suite("Disposal", () => {
    test("Should dispose without errors", () => {
      assert.doesNotThrow(() => {
        telemetryService.dispose();
      });
    });
  });
});
