/**
 * Tests for TelemetryService
 * Anonymous usage analytics service
 */

import * as assert from "assert";
import * as sinon from "sinon";
import { TelemetryService } from "../../src/shared/services/telemetryService";
import { SettingsManager } from "../../src/core/settingsManager";
import { LoggingService } from "../../src/shared/services/loggingService";

suite("Unit: TelemetryService", () => {
  let telemetryService: TelemetryService;
  let sandbox: sinon.SinonSandbox;
  let fakeClient: {
    config: { maxBatchSize: number; maxBatchIntervalMs: number };
    commonProperties: { [key: string]: string };
    trackEvent: sinon.SinonStub;
    trackException: sinon.SinonStub;
    trackMetric: sinon.SinonStub;
    flush: sinon.SinonStub;
  };
  let logInfo: sinon.SinonStub;
  let logWarn: sinon.SinonStub;
  let logError: sinon.SinonStub;
  let logDebug: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();

    logInfo = sandbox.stub();
    logWarn = sandbox.stub();
    logError = sandbox.stub();
    logDebug = sandbox.stub();

    sandbox.stub(LoggingService, "getInstance").returns({
      info: logInfo,
      warn: logWarn,
      error: logError,
      debug: logDebug,
      setLogLevel: sandbox.stub(),
      show: sandbox.stub(),
      clear: sandbox.stub(),
      dispose: sandbox.stub(),
    } as unknown as LoggingService);

    sandbox.stub(SettingsManager, "getVSCodeTelemetryLevel").returns("all");
    sandbox.stub(SettingsManager, "isNexkitTelemetryEnabled").returns(true);
    sandbox.stub(SettingsManager, "getTelemetryConnectionString").returns("InstrumentationKey=test-key");

    fakeClient = {
      config: { maxBatchSize: 0, maxBatchIntervalMs: 0 },
      commonProperties: {},
      trackEvent: sandbox.stub(),
      trackException: sandbox.stub(),
      trackMetric: sandbox.stub(),
      flush: sandbox.stub().resolves(),
    };

    telemetryService = new TelemetryService();

    sandbox.stub(telemetryService as any, "fetchPublicIP").resolves("127.0.0.1");
    sandbox.stub(telemetryService as any, "createTelemetryClient").returns(fakeClient as any);
  });

  teardown(() => {
    sandbox.restore();
    if (telemetryService) {
      telemetryService.dispose();
    }
  });

  suite("Initialization", () => {
    test("Should initialize telemetry when settings are permissive", async () => {
      await telemetryService.initialize();

      assert.strictEqual((telemetryService as any).isEnabled, true);
      assert.strictEqual(fakeClient.config.maxBatchSize, 50);
      assert.strictEqual(fakeClient.config.maxBatchIntervalMs, 15000);
      assert.ok(logInfo.calledWithMatch("Telemetry SDK diagnostics enabled"));
      assert.ok(logInfo.calledWithMatch("Telemetry initialized successfully"));
    });

    test("Should skip initialization when VS Code telemetry level is off", async () => {
      (SettingsManager.getVSCodeTelemetryLevel as sinon.SinonStub).returns("off");

      await telemetryService.initialize();

      assert.strictEqual((telemetryService as any).isEnabled, false);
      assert.ok(logInfo.calledWithMatch("Telemetry disabled: VS Code telemetry level is 'off'"));
      assert.strictEqual(fakeClient.trackEvent.callCount, 0);
    });

    test("Should log initialization failure diagnostics", async () => {
      (telemetryService as any).createTelemetryClient.restore();
      sandbox.stub(telemetryService as any, "createTelemetryClient").throws(new Error("client init failed"));

      await telemetryService.initialize();

      assert.ok(logError.calledWithMatch("Telemetry initialization failed", sinon.match.instanceOf(Error)));
    });

    test("Should log invalid connection string diagnostics", async () => {
      (SettingsManager.getTelemetryConnectionString as sinon.SinonStub).returns("InstrumentationKey=not-a-guid");

      await telemetryService.initialize();

      assert.strictEqual((telemetryService as any).isEnabled, false);
      assert.ok(logError.calledWithMatch("invalid Application Insights connection string"));
    });
  });

  suite("Event Tracking", () => {
    test("Should emit startup health event after successful initialization", async () => {
      await telemetryService.initialize();

      const healthEventCall = fakeClient.trackEvent
        .getCalls()
        .find((call) => call.args[0]?.name === "telemetry.health.startup");

      assert.ok(healthEventCall, "Expected telemetry.health.startup event to be emitted");
      assert.strictEqual(healthEventCall?.args[0]?.properties?.nexkitTelemetryEnabled, "true");
      assert.ok(healthEventCall?.args[0]?.properties?.sessionId);
      assert.ok(healthEventCall?.args[0]?.properties?.extensionVersion);
    });

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

    test("Should emit activation event after successful initialization", async () => {
      await telemetryService.initialize();

      assert.doesNotThrow(() => {
        telemetryService.trackActivation();
      });

      const activationCall = fakeClient.trackEvent
        .getCalls()
        .find((call) => call.args[0]?.name === "extension.activated");
      assert.ok(activationCall, "Expected extension.activated event to be emitted");
    });

    test("Should log flush failures for diagnostics", async () => {
      fakeClient.flush.rejects(new Error("flush failed"));
      await telemetryService.initialize();

      telemetryService.trackActivation();
      await Promise.resolve();

      assert.ok(logError.calledWithMatch("Telemetry flush failed"));
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
