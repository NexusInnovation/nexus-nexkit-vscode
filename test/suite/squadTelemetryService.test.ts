import * as assert from "assert";
import * as sinon from "sinon";
import { SettingsManager } from "../../src/core/settingsManager";
import {
  SQUAD_TELEMETRY_EVENT_NAME,
  SquadTelemetryFeature,
  SquadTelemetryOutcome,
  SquadTelemetryService,
} from "../../src/features/squad/services/squadTelemetryService";

suite("Unit: SquadTelemetryService (SQD-049)", () => {
  let sandbox: sinon.SinonSandbox;
  let trackEvent: sinon.SinonStub;
  let vscodeTelemetryLevel: sinon.SinonStub;
  let nexkitTelemetryEnabled: sinon.SinonStub;
  let squadTelemetryEnabled: sinon.SinonStub;
  let service: SquadTelemetryService;

  setup(() => {
    sandbox = sinon.createSandbox();
    trackEvent = sandbox.stub();
    vscodeTelemetryLevel = sandbox.stub(SettingsManager, "getVSCodeTelemetryLevel").returns("all");
    nexkitTelemetryEnabled = sandbox.stub(SettingsManager, "isNexkitTelemetryEnabled").returns(true);
    squadTelemetryEnabled = sandbox.stub(SettingsManager, "isSquadTelemetryEnabled").returns(true);
    service = new SquadTelemetryService({ trackEvent });
  });

  teardown(() => {
    sandbox.restore();
  });

  test("emits only anonymous allowlisted Squad journey properties", () => {
    service.trackFeatureUsage({
      feature: SquadTelemetryFeature.Plugins,
      action: "install",
      outcome: SquadTelemetryOutcome.Success,
      properties: {
        changed: true,
        source: "C:\\Users\\Eric\\secret-workspace\\plugin",
        workspaceName: "secret-workspace",
        filePath: "C:\\Users\\Eric\\secret-workspace\\.squad\\config.json",
        content: "# user prompt",
      } as unknown as Record<string, string | boolean>,
      measurements: {
        pluginCount: 2,
        rejectedUnsafeMetric: 10,
      },
    });

    assert.ok(trackEvent.calledOnce, "expected one sanitized telemetry event");
    const [eventName, properties, measurements] = trackEvent.firstCall.args as [
      string,
      Record<string, string>,
      Record<string, number>,
    ];
    assert.strictEqual(eventName, SQUAD_TELEMETRY_EVENT_NAME);
    assert.deepStrictEqual(properties, {
      feature: "plugins",
      action: "install",
      outcome: "success",
      changed: "true",
      source: "redacted",
    });
    assert.deepStrictEqual(measurements, { pluginCount: 2 });

    const serializedCall = JSON.stringify(trackEvent.firstCall.args);
    assert.ok(!serializedCall.includes("Eric"), "must not include user names");
    assert.ok(!serializedCall.includes("secret-workspace"), "must not include workspace names");
    assert.ok(!serializedCall.includes(".squad"), "must not include file names or paths");
    assert.ok(!serializedCall.includes("user prompt"), "must not include user content");
  });

  test("respects Squad, NexKit and VS Code telemetry opt-outs", () => {
    const cases = [
      { vscodeLevel: "off", nexkitEnabled: true, squadEnabled: true },
      { vscodeLevel: "all", nexkitEnabled: false, squadEnabled: true },
      { vscodeLevel: "all", nexkitEnabled: true, squadEnabled: false },
    ];

    for (const testCase of cases) {
      trackEvent.resetHistory();
      vscodeTelemetryLevel.returns(testCase.vscodeLevel);
      nexkitTelemetryEnabled.returns(testCase.nexkitEnabled);
      squadTelemetryEnabled.returns(testCase.squadEnabled);

      service.trackFeatureUsage({
        feature: SquadTelemetryFeature.State,
        action: "get",
        outcome: SquadTelemetryOutcome.Success,
      });

      assert.ok(trackEvent.notCalled, `expected opt-out for ${JSON.stringify(testCase)}`);
    }
  });
});
