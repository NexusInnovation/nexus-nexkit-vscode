/**
 * Unit tests for the check -> validate -> setup state machine.
 *
 * The real `PrerequisiteRunnerService` is used throughout so that interpretation
 * (exit code + marker -> domain meaning) is exercised together with the flow.
 * Only the process boundary and the filesystem are faked.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";
import {
  PrerequisiteOrchestratorService,
  toDurationBucket,
} from "../../src/features/prerequisite-automation/prerequisiteOrchestratorService";
import { PrerequisiteConfigService } from "../../src/features/prerequisite-automation/prerequisiteConfigService";
import { PrerequisiteRunnerService } from "../../src/features/prerequisite-automation/prerequisiteRunnerService";
import { ConfirmationService, ConfirmationResult } from "../../src/shared/services/confirmationService";
import { TelemetryService } from "../../src/shared/services/telemetryService";
import { ConfigLoadResult, OrchestrationResult } from "../../src/features/prerequisite-automation/types";
import {
  FakeClock,
  FakeFileSystem,
  FakeLogger,
  FakeProcessRunner,
  WORKSPACE_ROOT,
  assertNoAbsolutePaths,
  assertSafeSpawns,
  crashed,
  ko,
  ok,
  scriptsRootUri,
  spawnFailed,
  timedOut,
  validatedMarker,
} from "./helpers/prerequisiteTestHelpers";

const SCRIPTS_ROOT = scriptsRootUri();

const CHECK = "check-validation.sh";
const VALIDATE = "validate-prerequisites.sh";
const SETUP = "setup-environment.sh";

const CONFIG: ConfigLoadResult = {
  kind: "found",
  config: {
    prerequisites: [
      { name: "Node.js", command: "node", required: true, minimumVersion: "24.0.0" },
      { name: "jq", command: "jq", required: false },
    ],
  },
  configPath: vscode.Uri.joinPath(SCRIPTS_ROOT, "requirements.json").fsPath,
  scriptsRoot: SCRIPTS_ROOT,
  workspaceRoot: WORKSPACE_ROOT,
};

interface Harness {
  orchestrator: PrerequisiteOrchestratorService;
  processRunner: FakeProcessRunner;
  logger: FakeLogger;
  telemetry: sinon.SinonSpy;
  confirm: sinon.SinonStub;
  confirmOnce: sinon.SinonStub;
}

interface HarnessOptions {
  platform?: NodeJS.Platform;
  trusted?: boolean;
  presentScripts?: string[];
  load?: () => Promise<ConfigLoadResult>;
  consent?: ConfirmationResult;
  installConsent?: boolean;
}

function buildHarness(options: HarnessOptions = {}): Harness {
  const platform = options.platform ?? "linux";
  const processRunner = new FakeProcessRunner();
  const logger = new FakeLogger();
  const fileSystem = new FakeFileSystem();

  for (const name of options.presentScripts ?? [CHECK, VALIDATE, SETUP]) {
    fileSystem.addFile(vscode.Uri.joinPath(SCRIPTS_ROOT, name).fsPath);
  }

  // The interpreter probes succeed by default; individual tests override them.
  processRunner.respondTo("jq", ok("")).respondTo("exit 0", ok(""));

  const runner = new PrerequisiteRunnerService(processRunner, logger, fileSystem, new FakeClock());

  const configService = {
    load: options.load ?? (() => Promise.resolve(CONFIG)),
  } as unknown as PrerequisiteConfigService;

  const confirm = sinon.stub().resolves(options.consent ?? "accepted");
  const confirmOnce = sinon.stub().resolves(options.installConsent ?? true);
  const confirmation = { confirm, confirmOnce } as unknown as ConfirmationService;

  const trackEvent = sinon.spy();
  const telemetry = { trackEvent } as unknown as TelemetryService;

  const orchestrator = new PrerequisiteOrchestratorService(
    configService,
    runner,
    confirmation,
    logger,
    telemetry,
    new FakeClock(),
    platform,
    () => options.trusted ?? true
  );

  return { orchestrator, processRunner, logger, telemetry: trackEvent, confirm, confirmOnce };
}

/** Script invocations only, with the probe calls removed. */
function stepsRun(processRunner: FakeProcessRunner): string[] {
  return processRunner.scriptCalls.map((call) => (call.args[call.args.length - 1].split(/[\\/]/).pop() ?? ""));
}

suite("Unit: PrerequisiteOrchestratorService — early exit", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(SettingsManager, "setPrerequisitesValidated").resolves();
    sandbox.stub(SettingsManager, "setPrerequisitesValidationDate").resolves();
  });

  teardown(() => sandbox.restore());

  test("a validated check exits immediately and runs the check script exactly once", async () => {
    // The highest-value assertion in the suite: proving the machine STOPS.
    // A regression here means every already-valid workspace re-runs validate,
    // and potentially an installer.
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ok(validatedMarker(true)));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "alreadyValidated");
    assert.strictEqual(result.furthestStep, "check");
    assert.strictEqual(result.steps.length, 1);
    assert.deepStrictEqual(stepsRun(h.processRunner), [CHECK]);
    assert.strictEqual(h.processRunner.callsMatching(VALIDATE).length, 0, "validate must never run");
    assert.strictEqual(h.processRunner.callsMatching(SETUP).length, 0, "setup must never run");
    assert.strictEqual(h.confirmOnce.callCount, 0, "the install prompt must never appear");
  });

  test("the workspaceState cache never short-circuits the check script", async () => {
    // The script's own answer is authoritative; the cache is a UI mirror only.
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ok(validatedMarker(true)));

    await h.orchestrator.run();

    assert.strictEqual(stepsRun(h.processRunner)[0], CHECK);
    assert.ok((SettingsManager.setPrerequisitesValidated as sinon.SinonStub).calledWith(true));
  });

  test("exit 0 with a negative marker is NOT treated as validated", async () => {
    // Marker/exit-code conflict must fail closed, otherwise a broken script can
    // assert validity it never proved.
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ok(validatedMarker(false))).respondTo(VALIDATE, ok(""));

    const result = await h.orchestrator.run();

    assert.notStrictEqual(result.outcome, "alreadyValidated");
    assert.ok(stepsRun(h.processRunner).includes(VALIDATE), "the machine must continue to validate");
  });
});

suite("Unit: PrerequisiteOrchestratorService — missing script abort", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(SettingsManager, "setPrerequisitesValidated").resolves();
    sandbox.stub(SettingsManager, "setPrerequisitesValidationDate").resolves();
  });

  teardown(() => sandbox.restore());

  test("a missing check script aborts the run and NEVER proceeds to validate", async () => {
    // Regression guard for the shipped defect: `scriptNotFound` collapsing into
    // `exitCode: 1` would look exactly like "not validated" and would launch an
    // unnecessary — and unconsented — validate/setup sequence.
    const h = buildHarness({ presentScripts: [VALIDATE, SETUP] });

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.strictEqual(result.furthestStep, "check");
    assert.strictEqual(result.error?.category, "NotFound");
    assert.notStrictEqual(result.error?.category, "Execution");

    assert.strictEqual(result.steps.length, 1);
    assert.strictEqual(result.steps[0].result.outcome, "scriptNotFound");
    assert.strictEqual(result.steps[0].result.exitCode, null, "exitCode must never be coerced to 1");

    assert.strictEqual(h.processRunner.callsMatching(VALIDATE).length, 0, "validate must never run");
    assert.strictEqual(h.processRunner.callsMatching(SETUP).length, 0, "setup must never run");
    assert.strictEqual(h.confirmOnce.callCount, 0, "the install prompt must never appear");
  });

  test("a missing validate script aborts before setup", async () => {
    const h = buildHarness({ presentScripts: [CHECK, SETUP] });
    h.processRunner.respondTo(CHECK, ko());

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.strictEqual(result.furthestStep, "validate");
    assert.strictEqual(result.error?.category, "NotFound");
    assert.strictEqual(h.processRunner.callsMatching(SETUP).length, 0);
  });

  test("a missing setup script aborts after consent without spawning anything", async () => {
    const h = buildHarness({ presentScripts: [CHECK, VALIDATE] });
    h.processRunner.respondTo(CHECK, ko()).respondTo(VALIDATE, ko(""));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.strictEqual(result.furthestStep, "setup");
    assert.strictEqual(result.error?.category, "NotFound");
  });

  test("the missing-script message names the script but leaks no absolute path", async () => {
    const h = buildHarness({ presentScripts: [] });
    const result = await h.orchestrator.run();

    const message = result.error?.toUserMessage() ?? "";
    assert.ok(message.includes(CHECK));
    assertNoAbsolutePaths(message, "orchestrator missing script");
  });
});

suite("Unit: PrerequisiteOrchestratorService — happy paths", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(SettingsManager, "setPrerequisitesValidated").resolves();
    sandbox.stub(SettingsManager, "setPrerequisitesValidationDate").resolves();
  });

  teardown(() => sandbox.restore());

  test("check fail -> validate pass -> re-check pass -> validated", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ko(), ok(validatedMarker(true))).respondTo(VALIDATE, ok(""));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "validated");
    assert.deepStrictEqual(stepsRun(h.processRunner), [CHECK, VALIDATE, CHECK]);
    assert.strictEqual(h.confirmOnce.callCount, 0, "no install consent is needed when validation succeeds");
    assert.ok((SettingsManager.setPrerequisitesValidated as sinon.SinonStub).calledWith(true));
  });

  test("check fail -> validate pass -> re-check still negative -> validationNotPersisted", async () => {
    // The scripts claimed success but never wrote their state file. Reporting
    // this distinctly is what makes the check/validate divergence diagnosable.
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ko(), ko()).respondTo(VALIDATE, ok(""));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "validationNotPersisted");
    assert.strictEqual(result.error?.category, "Configuration");
    assert.ok((SettingsManager.setPrerequisitesValidated as sinon.SinonStub).calledWith(false));
    assert.ok(h.logger.hasMessageContaining("not persisted"));
  });

  test("check fail -> validate fail -> setup pass -> final check pass -> validated", async () => {
    const h = buildHarness();
    h.processRunner
      .respondTo(CHECK, ko(), ok(validatedMarker(true)))
      .respondTo(VALIDATE, ko(""))
      .respondTo(SETUP, ok(""));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "validated");
    assert.strictEqual(result.furthestStep, "check");
    assert.deepStrictEqual(stepsRun(h.processRunner), [CHECK, VALIDATE, SETUP, CHECK]);
    assert.strictEqual(h.confirmOnce.callCount, 1, "installing software requires explicit consent");
  });

  test("all three phases fail -> setupFailed with an actionable error", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ko()).respondTo(VALIDATE, ko("")).respondTo(SETUP, ko(""));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "setupFailed");
    assert.strictEqual(result.furthestStep, "setup");
    assert.strictEqual(result.error?.category, "Execution");
    assert.ok((result.error?.remediation ?? "").length > 0);
    assert.deepStrictEqual(stepsRun(h.processRunner), [CHECK, VALIDATE, SETUP]);
  });

  test("setup never retries after a failure", async () => {
    // Re-running a partially-succeeded installer can leave a machine worse off
    // than failing cleanly.
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ko()).respondTo(VALIDATE, ko("")).respondTo(SETUP, ko(""));

    await h.orchestrator.run();

    assert.strictEqual(h.processRunner.callsMatching(SETUP).length, 1);
  });

  test("setup succeeds but the final check is still negative -> stillInvalid", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ko(), ko()).respondTo(VALIDATE, ko("")).respondTo(SETUP, ok(""));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "stillInvalid");
    assert.strictEqual(result.error?.category, "Execution");
    assert.deepStrictEqual(stepsRun(h.processRunner), [CHECK, VALIDATE, SETUP, CHECK]);
  });

  test("declining the install stops before setup", async () => {
    const h = buildHarness({ installConsent: false });
    h.processRunner.respondTo(CHECK, ko()).respondTo(VALIDATE, ko(""));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "setupDeclined");
    assert.strictEqual(result.furthestStep, "validate");
    assert.strictEqual(result.error, undefined, "a declined install is not an error");
    assert.strictEqual(h.processRunner.callsMatching(SETUP).length, 0);
  });

  test("the install consent lists the declared prerequisites as plain text", async () => {
    const h = buildHarness({ installConsent: false });
    h.processRunner.respondTo(CHECK, ko()).respondTo(VALIDATE, ko(""));

    await h.orchestrator.run();

    const detail = h.confirmOnce.firstCall.args[1] as string;
    assert.ok(detail.includes("Node.js"));
    assert.ok(detail.includes("24.0.0"));
    assert.ok(detail.includes("trust"), "the consent must state the trust implication");
  });

  test("the correlation id is constant across every phase of a run", async () => {
    const h = buildHarness();
    h.processRunner
      .respondTo(CHECK, ko(), ok(validatedMarker(true)))
      .respondTo(VALIDATE, ko(""))
      .respondTo(SETUP, ok(""));

    const result = await h.orchestrator.run();

    assert.ok(result.correlationId.length > 0);
    const tagged = h.logger.messages.filter((message) => message.includes(result.correlationId));
    assert.ok(tagged.length >= result.steps.length, "every step must be traceable to the same run");
  });

  test("two runs use different correlation ids", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ok(validatedMarker(true)));

    const first = await h.orchestrator.run();
    const second = await h.orchestrator.run();

    assert.notStrictEqual(first.correlationId, second.correlationId);
  });
});

suite("Unit: PrerequisiteOrchestratorService — guards and refusals", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(SettingsManager, "setPrerequisitesValidated").resolves();
    sandbox.stub(SettingsManager, "setPrerequisitesValidationDate").resolves();
  });

  teardown(() => sandbox.restore());

  test("an untrusted workspace refuses before any process is started", async () => {
    const h = buildHarness({ trusted: false });

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.strictEqual(result.error?.category, "Trust");
    assert.strictEqual(h.processRunner.calls.length, 0, "nothing may be spawned in Restricted Mode");
    assert.strictEqual(h.confirm.callCount, 0);
  });

  test("an unsupported platform refuses before any process is started", async () => {
    const h = buildHarness({ platform: "aix" as NodeJS.Platform });

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.strictEqual(result.error?.category, "Configuration");
    assert.strictEqual(h.processRunner.calls.length, 0);
  });

  test("a workspace without configuration is a calm no-op", async () => {
    const h = buildHarness({ load: () => Promise.resolve({ kind: "absent" }) });

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "notConfigured");
    assert.strictEqual(result.error, undefined, "an unconfigured workspace is not an error");
    assert.strictEqual(h.processRunner.calls.length, 0);
    assert.strictEqual(h.confirm.callCount, 0, "no dialog may appear for an unconfigured workspace");
  });

  test("a malformed configuration fails the run without spawning anything", async () => {
    const h = buildHarness({
      load: () => Promise.reject(new Error("requirements.json is not valid JSON.")),
    });

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.ok(result.error);
    assert.strictEqual(h.processRunner.calls.length, 0);
    assertNoAbsolutePaths(result.error?.toUserMessage() ?? "", "config failure");
  });

  test("an unexpected non-PrerequisiteError is wrapped rather than leaked", async () => {
    const h = buildHarness({ load: () => Promise.reject(new Error("EACCES /home/eric/secret/path")) });

    const result = await h.orchestrator.run();

    assert.strictEqual(result.error?.category, "Execution");
    assertNoAbsolutePaths(result.error?.toUserMessage() ?? "", "wrapped error");
  });

  test("refusing the run consent stops before any script", async () => {
    const h = buildHarness({ consent: "refused" });

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "declined");
    assert.strictEqual(h.processRunner.calls.length, 0);
  });

  test("a persisted refuse-forever also stops the run", async () => {
    const h = buildHarness({ consent: "refused-forever" });

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "declined");
    assert.strictEqual(h.processRunner.calls.length, 0);
  });

  test("missing jq on Unix fails with Configuration before any .sh executes", async () => {
    const h = buildHarness({ platform: "linux" });
    h.processRunner.overrideResponse("jq", spawnFailed("ENOENT"));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.strictEqual(result.furthestStep, "none");
    assert.strictEqual(result.error?.category, "Configuration");
    assert.ok((result.error?.remediation ?? "").includes("jq"));
    assert.strictEqual(h.processRunner.scriptCalls.length, 0, "no shell script may run without jq");
  });

  test("no usable PowerShell host on Windows fails before any script", async () => {
    const h = buildHarness({
      platform: "win32",
      presentScripts: ["Check-Validation.ps1", "Validate-Prerequisites.ps1", "Setup-Environment.ps1"],
    });
    h.processRunner.overrideResponse("exit 0", spawnFailed("ENOENT"));

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.strictEqual(result.error?.category, "NotFound");
    assert.strictEqual(h.processRunner.scriptCalls.length, 0);
  });
});

suite("Unit: PrerequisiteOrchestratorService — timeout, cancellation, re-entrancy", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(SettingsManager, "setPrerequisitesValidated").resolves();
    sandbox.stub(SettingsManager, "setPrerequisitesValidationDate").resolves();
  });

  teardown(() => sandbox.restore());

  test("a timeout at check aborts with Timeout and never reaches validate", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, timedOut());

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.strictEqual(result.furthestStep, "check");
    assert.strictEqual(result.error?.category, "Timeout");
    assert.strictEqual(h.processRunner.callsMatching(VALIDATE).length, 0);
  });

  test("a timeout at validate aborts with Timeout and never reaches setup", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ko()).respondTo(VALIDATE, timedOut());

    const result = await h.orchestrator.run();

    assert.strictEqual(result.furthestStep, "validate");
    assert.strictEqual(result.error?.category, "Timeout");
    assert.strictEqual(h.processRunner.callsMatching(SETUP).length, 0);
  });

  test("a timeout at setup is reported as a Timeout, not a setup failure", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ko()).respondTo(VALIDATE, ko("")).respondTo(SETUP, timedOut());

    const result = await h.orchestrator.run();

    assert.strictEqual(result.outcome, "failed");
    assert.strictEqual(result.furthestStep, "setup");
    assert.strictEqual(result.error?.category, "Timeout");
  });

  test("a spawn failure at check aborts with Execution", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, spawnFailed());

    const result = await h.orchestrator.run();

    assert.strictEqual(result.error?.category, "Execution");
    assert.strictEqual(h.processRunner.callsMatching(VALIDATE).length, 0);
  });

  test("an externally cancelled run stops after the current phase", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ko());
    const source = new vscode.CancellationTokenSource();
    source.cancel();

    const result = await h.orchestrator.run(source.token);

    assert.strictEqual(result.outcome, "cancelled");
    assert.strictEqual(result.furthestStep, "check");
    assert.strictEqual(h.processRunner.callsMatching(VALIDATE).length, 0, "cancellation must stop the machine");
    source.dispose();
  });

  test("a second concurrent run is refused rather than queued", async () => {
    // Two overlapping installer runs can corrupt a machine, so the guard
    // refuses instead of serialising.
    let releaseLoad: (value: ConfigLoadResult) => void = () => undefined;
    const gate = new Promise<ConfigLoadResult>((resolve) => {
      releaseLoad = resolve;
    });

    const h = buildHarness({ load: () => gate });
    h.processRunner.respondTo(CHECK, ok(validatedMarker(true)));

    const first = h.orchestrator.run();
    assert.strictEqual(h.orchestrator.isRunning, true);

    const second = await h.orchestrator.run();

    assert.strictEqual(second.outcome, "alreadyRunning");
    assert.strictEqual(second.error?.category, "Concurrency");
    assert.strictEqual(second.steps.length, 0);

    releaseLoad(CONFIG);
    const firstResult = await first;
    assert.strictEqual(firstResult.outcome, "alreadyValidated");
    assert.strictEqual(h.orchestrator.isRunning, false);
  });

  test("the re-entrancy guard is released after a failing run", async () => {
    const h = buildHarness({ load: () => Promise.reject(new Error("boom")) });

    await h.orchestrator.run();

    assert.strictEqual(h.orchestrator.isRunning, false, "a failure must not wedge the guard");
  });
});

suite("Unit: PrerequisiteOrchestratorService — telemetry and spawn hygiene", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(SettingsManager, "setPrerequisitesValidated").resolves();
    sandbox.stub(SettingsManager, "setPrerequisitesValidationDate").resolves();
  });

  teardown(() => sandbox.restore());

  test("telemetry carries only the bucketed, non-identifying fields", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, ok(validatedMarker(true)));

    await h.orchestrator.run();

    assert.strictEqual(h.telemetry.callCount, 1);
    const [eventName, properties] = h.telemetry.firstCall.args as [string, Record<string, string>];

    assert.strictEqual(eventName, "prerequisites.run");
    assert.deepStrictEqual(Object.keys(properties).sort(), [
      "durationBucket",
      "errorCategory",
      "furthestStep",
      "outcome",
      "platform",
    ]);
    for (const value of Object.values(properties)) {
      assertNoAbsolutePaths(String(value), "telemetry property");
    }
  });

  test("telemetry reports the error category on a failure and 'none' otherwise", async () => {
    const failing = buildHarness({ presentScripts: [] });
    await failing.orchestrator.run();
    assert.strictEqual((failing.telemetry.firstCall.args[1] as Record<string, string>).errorCategory, "NotFound");

    const passing = buildHarness();
    passing.processRunner.respondTo(CHECK, ok(validatedMarker(true)));
    await passing.orchestrator.run();
    assert.strictEqual((passing.telemetry.firstCall.args[1] as Record<string, string>).errorCategory, "none");
  });

  test("every spawn across a full four-phase run obeys the security rules", async () => {
    const h = buildHarness();
    h.processRunner
      .respondTo(CHECK, ko(), ok(validatedMarker(true)))
      .respondTo(VALIDATE, ko(""))
      .respondTo(SETUP, ok(""));

    await h.orchestrator.run();

    assertSafeSpawns(h.processRunner);
  });

  test("an unexpected exit code degrades to 'not validated' rather than crashing", async () => {
    const h = buildHarness();
    h.processRunner.respondTo(CHECK, crashed(2)).respondTo(VALIDATE, ok(""));

    const result = await h.orchestrator.run();

    assert.ok(stepsRun(h.processRunner).includes(VALIDATE));
    assert.notStrictEqual(result.outcome, "alreadyValidated");
  });
});

suite("Unit: toDurationBucket", () => {
  test("durations map to coarse, non-identifying buckets", () => {
    assert.strictEqual(toDurationBucket(0), "0-5s");
    assert.strictEqual(toDurationBucket(4_999), "0-5s");
    assert.strictEqual(toDurationBucket(5_000), "5-30s");
    assert.strictEqual(toDurationBucket(29_999), "5-30s");
    assert.strictEqual(toDurationBucket(30_000), "30s-2m");
    assert.strictEqual(toDurationBucket(119_999), "30s-2m");
    assert.strictEqual(toDurationBucket(120_000), "2m-10m");
    assert.strictEqual(toDurationBucket(599_999), "2m-10m");
    assert.strictEqual(toDurationBucket(600_000), "10m+");
    assert.strictEqual(toDurationBucket(9_999_999), "10m+");
  });
});

/** Convenience re-export so the shape stays visible in failure output. */
export type { OrchestrationResult };
