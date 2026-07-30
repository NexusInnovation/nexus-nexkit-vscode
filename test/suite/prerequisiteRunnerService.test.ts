/**
 * Unit tests for phase execution and result interpretation.
 *
 * Every process execution goes through the injected `IProcessRunner`, so no test
 * in this suite starts a real interpreter or touches a real script.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
  PrerequisiteRunnerService,
  STEP_TIMEOUTS_MS,
} from "../../src/features/prerequisite-automation/prerequisiteRunnerService";
import { PrerequisiteStep } from "../../src/features/prerequisite-automation/types";
import {
  FakeClock,
  FakeFileSystem,
  FakeLogger,
  FakeProcessRunner,
  WORKSPACE_ROOT,
  assertNoAbsolutePaths,
  assertSafeSpawns,
  captureErrorAsync,
  crashed,
  ko,
  ok,
  scriptsRootUri,
  spawnFailed,
  timedOut,
  validatedMarker,
  withStderr,
} from "./helpers/prerequisiteTestHelpers";

const SCRIPTS_ROOT = scriptsRootUri();

const ALL_SCRIPTS = [
  "Check-Validation.ps1",
  "Validate-Prerequisites.ps1",
  "Setup-Environment.ps1",
  "check-validation.sh",
  "validate-prerequisites.sh",
  "setup-environment.sh",
];

interface Harness {
  runner: PrerequisiteRunnerService;
  processRunner: FakeProcessRunner;
  fileSystem: FakeFileSystem;
  logger: FakeLogger;
}

function harness(options: { presentScripts?: string[] } = {}): Harness {
  const processRunner = new FakeProcessRunner();
  const fileSystem = new FakeFileSystem();
  const logger = new FakeLogger();

  for (const name of options.presentScripts ?? ALL_SCRIPTS) {
    fileSystem.addFile(vscode.Uri.joinPath(SCRIPTS_ROOT, name).fsPath);
  }

  return {
    runner: new PrerequisiteRunnerService(processRunner, logger, fileSystem, new FakeClock()),
    processRunner,
    fileSystem,
    logger,
  };
}

function runOptions(step: PrerequisiteStep, platform: NodeJS.Platform) {
  return {
    step,
    scriptsRoot: SCRIPTS_ROOT,
    workspaceRoot: WORKSPACE_ROOT,
    platform,
    correlationId: "corr-1",
  };
}

suite("Unit: PrerequisiteRunnerService — invocation construction", () => {
  test("Unix runs the script through bash explicitly, never the shebang", async () => {
    // The reference .sh scripts use process substitution and `declare -a`, so
    // sh/dash/zsh are not interchangeable with bash here.
    const h = harness();
    h.processRunner.fallback(ok());

    await h.runner.runStep(runOptions("check", "linux"));

    const call = h.processRunner.scriptCalls[0];
    assert.strictEqual(call.command, "bash");
    assert.strictEqual(call.args.length, 1);
    assert.ok(call.args[0].endsWith("check-validation.sh"));
  });

  test("Windows runs PowerShell with the hardened switch set", async () => {
    const h = harness();
    h.processRunner.respondTo("exit 0", ok("")).fallback(ok());

    await h.runner.runStep(runOptions("check", "win32"));

    const call = h.processRunner.scriptCalls[0];
    assert.ok(["pwsh", "powershell.exe"].includes(call.command));
    assert.ok(call.args.includes("-NoProfile"));
    assert.ok(call.args.includes("-NonInteractive"));
    assert.ok(call.args.includes("-ExecutionPolicy"));
    assert.ok(call.args.includes("Bypass"));
    assert.ok(call.args.includes("-File"));
  });

  test("the check step is NOT given -Interactive, matching Check-Validation.ps1's parameter list", async () => {
    // Check-Validation.ps1 declares only [string]$SettingsPath. Passing an
    // unknown switch there would make PowerShell fail the whole run.
    const h = harness();
    h.processRunner.respondTo("exit 0", ok("")).fallback(ok());

    await h.runner.runStep(runOptions("check", "win32"));

    const call = h.processRunner.scriptCalls[0];
    assert.ok(!call.args.some((arg) => arg.startsWith("-Interactive")));
  });

  test("validate and setup are forced non-interactive on Windows", async () => {
    // Both Validate-Prerequisites.ps1 and Setup-Environment.ps1 declare
    // [switch]$Interactive = $true; without this, Read-Host hangs the run.
    for (const step of ["validate", "setup"] as const) {
      const h = harness();
      h.processRunner.respondTo("exit 0", ok("")).fallback(ok(""));

      await h.runner.runStep(runOptions(step, "win32"));

      const call = h.processRunner.scriptCalls[0];
      assert.ok(
        call.args.includes("-Interactive:$false"),
        `${step} must be invoked with -Interactive:$false`
      );
    }
  });

  test("the script path is the final argument and is never concatenated into the command", async () => {
    const h = harness();
    h.processRunner.respondTo("exit 0", ok("")).fallback(ok());

    await h.runner.runStep(runOptions("validate", "win32"));

    const call = h.processRunner.scriptCalls[0];
    const fileIndex = call.args.indexOf("-File");
    assert.ok(fileIndex >= 0);
    assert.ok(call.args[fileIndex + 1].endsWith("Validate-Prerequisites.ps1"));
    assert.ok(!call.command.includes("Validate-Prerequisites"));
  });

  test("each step carries its own timeout and a kill grace period", async () => {
    for (const step of ["check", "validate", "setup"] as const) {
      const h = harness();
      h.processRunner.fallback(ok());

      await h.runner.runStep(runOptions(step, "linux"));

      const call = h.processRunner.scriptCalls[0];
      assert.strictEqual(call.options.timeoutMs, STEP_TIMEOUTS_MS[step]);
      assert.ok(call.options.killGraceMs > 0, "a hard-kill grace period is required");
      assert.ok((call.options.maxOutputBytes ?? 0) > 0, "output must be capped");
    }
  });

  test("setup is allowed a materially longer timeout than check", () => {
    assert.ok(STEP_TIMEOUTS_MS.setup > STEP_TIMEOUTS_MS.validate);
    assert.ok(STEP_TIMEOUTS_MS.validate > STEP_TIMEOUTS_MS.check);
  });

  test("the process runs with the workspace root as its working directory", async () => {
    const h = harness();
    h.processRunner.fallback(ok());

    await h.runner.runStep(runOptions("check", "linux"));

    assert.strictEqual(h.processRunner.scriptCalls[0].options.cwd, WORKSPACE_ROOT.fsPath);
  });

  test("no phantom non-interactive environment flag is exported to the child", async () => {
    // NEXKIT_NON_INTERACTIVE used to be injected here, but no reference script
    // ever read it. It was removed rather than left as a contract that only one
    // side honoured; Windows non-interactivity comes from -Interactive:$false.
    const h = harness();
    h.processRunner.fallback(ok());

    await h.runner.runStep(runOptions("check", "linux"));

    assert.strictEqual(h.processRunner.scriptCalls[0].options.env?.NEXKIT_NON_INTERACTIVE, undefined);
  });
});

suite("Unit: PrerequisiteRunnerService — security guards", () => {
  test("every spawn passes arguments as an array and never enables a shell", async () => {
    const h = harness();
    h.processRunner.respondTo("exit 0", ok("")).fallback(ok());

    for (const platform of ["linux", "darwin", "win32"] as const) {
      for (const step of ["check", "validate", "setup"] as const) {
        await h.runner.runStep(runOptions(step, platform));
      }
    }

    assertSafeSpawns(h.processRunner);
  });

  test("probe invocations are also array-based and shell-free", async () => {
    const h = harness();
    h.processRunner.respondTo("jq", ok("")).fallback(ok());

    await h.runner.ensureEnvironment("linux", WORKSPACE_ROOT.fsPath);

    assertSafeSpawns(h.processRunner);
    const probe = h.processRunner.callsMatching("jq")[0];
    assert.deepStrictEqual(probe.args, ["--version"]);
  });

  test("no filename outside the allowlist can ever be executed", async () => {
    const h = harness();
    h.processRunner.respondTo("exit 0", ok("")).fallback(ok());

    for (const platform of ["linux", "win32"] as const) {
      for (const step of ["check", "validate", "setup"] as const) {
        await h.runner.runStep(runOptions(step, platform));
      }
    }

    for (const call of h.processRunner.scriptCalls) {
      const scriptArg = call.args.find((arg) => /\.(ps1|sh)$/.test(arg));
      assert.ok(scriptArg, "a script invocation must carry a script path argument");
      const fileName = scriptArg.split(/[\\/]/).pop() ?? "";
      assert.ok(ALL_SCRIPTS.includes(fileName), `"${fileName}" is not on the allowlist`);
    }
  });
});

suite("Unit: PrerequisiteRunnerService — result interpretation", () => {
  test("exit 0 with a positive marker is a validated execution", async () => {
    const h = harness();
    h.processRunner.fallback(ok(validatedMarker(true)));

    const execution = await h.runner.runStep(runOptions("check", "linux"));

    assert.strictEqual(execution.result.outcome, "completed");
    assert.strictEqual(execution.result.exitCode, 0);
    assert.strictEqual(execution.validated, true);
    assert.strictEqual(execution.markerConflict, false);
    assert.strictEqual(h.runner.classifyFailure(execution), undefined);
  });

  test("exit 1 with a negative marker is a clean negative, not a failure", async () => {
    const h = harness();
    h.processRunner.fallback(ko());

    const execution = await h.runner.runStep(runOptions("check", "linux"));

    assert.strictEqual(execution.validated, false);
    assert.strictEqual(execution.markerConflict, false);
    assert.strictEqual(
      h.runner.classifyFailure(execution),
      undefined,
      "a negative answer is not an error condition"
    );
  });

  test("a CRLF marker is parsed through the execution path", async () => {
    const h = harness();
    h.processRunner.fallback(ok("::VALIDATED::true\r\n"));

    const execution = await h.runner.runStep(runOptions("check", "win32"));
    assert.strictEqual(execution.validated, true);
  });

  test("a marker disagreeing with the exit code is flagged and logged", async () => {
    const h = harness();
    h.processRunner.fallback(ok(validatedMarker(false)));

    const execution = await h.runner.runStep(runOptions("check", "linux"));

    assert.strictEqual(execution.validated, false);
    assert.strictEqual(execution.markerConflict, true);
    assert.ok(h.logger.hasMessageContaining("disagrees with the exit code"));
  });

  test("output with no marker leaves validated undefined", async () => {
    const h = harness();
    h.processRunner.fallback(ok("nothing useful"));

    const execution = await h.runner.runStep(runOptions("check", "linux"));

    assert.strictEqual(execution.validated, undefined);
    assert.strictEqual(execution.markerConflict, false);
  });

  test("a marker is never parsed from a non-completed run", async () => {
    const h = harness();
    h.processRunner.fallback(timedOut());

    const execution = await h.runner.runStep(runOptions("check", "linux"));
    assert.strictEqual(execution.validated, undefined);
  });

  test("the execution log records outcome, exit code, duration and marker", async () => {
    const h = harness();
    h.processRunner.fallback(ok());

    await h.runner.runStep(runOptions("check", "linux"));

    assert.ok(h.logger.hasMessageContaining("outcome=completed"));
    assert.ok(h.logger.hasMessageContaining("exitCode=0"));
    assert.ok(h.logger.hasMessageContaining("durationMs="));
    assert.ok(h.logger.hasMessageContaining("corr-1"), "the correlation id must appear in the log");
  });
});

suite("Unit: PrerequisiteRunnerService — failure classification", () => {
  test("a missing script yields scriptNotFound and NEVER collapses into exit code 1", async () => {
    // This is the shipped-bug guard. A missing check script is a broken setup;
    // reporting it as "not validated" would silently start an install run.
    const h = harness({ presentScripts: [] });

    const execution = await h.runner.runStep(runOptions("check", "linux"));

    assert.strictEqual(execution.result.outcome, "scriptNotFound");
    assert.strictEqual(execution.result.exitCode, null, "exitCode must stay null, never 1");
    assert.notStrictEqual(execution.result.exitCode, 1);
    assert.strictEqual(execution.validated, undefined);
    assert.strictEqual(h.processRunner.calls.length, 0, "a missing script must not be spawned");

    const error = h.runner.classifyFailure(execution);
    assert.ok(error, "a missing script must classify as a failure");
    assert.strictEqual(error.category, "NotFound");
    assert.ok(error.message.includes("check-validation.sh"));
    assertNoAbsolutePaths(error.toUserMessage(), "scriptNotFound");
  });

  test("a missing script is reported per step with the right filename", async () => {
    for (const [step, fileName] of [
      ["check", "check-validation.sh"],
      ["validate", "validate-prerequisites.sh"],
      ["setup", "setup-environment.sh"],
    ] as const) {
      const h = harness({ presentScripts: [] });
      const execution = await h.runner.runStep(runOptions(step, "linux"));
      assert.strictEqual(execution.scriptFileName, fileName);
      assert.ok(h.runner.classifyFailure(execution)?.message.includes(fileName));
    }
  });

  test("a timeout classifies as Timeout with remediation", async () => {
    const h = harness();
    h.processRunner.fallback(timedOut());

    const execution = await h.runner.runStep(runOptions("validate", "linux"));
    const error = h.runner.classifyFailure(execution);

    assert.strictEqual(error?.category, "Timeout");
    assert.ok((error?.remediation ?? "").length > 0);
    assertNoAbsolutePaths(error?.toUserMessage() ?? "", "timeout");
  });

  test("a spawn failure classifies as Execution and never surfaces the raw reason", async () => {
    const h = harness();
    h.processRunner.fallback(spawnFailed("ENOENT: spawn /usr/local/bin/bash ENOENT"));

    const execution = await h.runner.runStep(runOptions("check", "linux"));
    const error = h.runner.classifyFailure(execution);

    assert.strictEqual(error?.category, "Execution");
    assertNoAbsolutePaths(error?.toUserMessage() ?? "", "spawnFailed");
  });

  test("a blocked PowerShell execution policy classifies as Permission", async () => {
    const h = harness();
    h.processRunner
      .respondTo("exit 0", ok(""))
      .fallback(withStderr("File cannot be loaded because execution of scripts is disabled on this system."));

    const execution = await h.runner.runStep(runOptions("validate", "win32"));
    const error = h.runner.classifyFailure(execution);

    assert.strictEqual(error?.category, "Permission");
    assert.ok((error?.remediation ?? "").toLowerCase().includes("execution policy"));
  });

  test("UnauthorizedAccess in stderr is also recognised as a policy block", async () => {
    const h = harness();
    h.processRunner.respondTo("exit 0", ok("")).fallback(withStderr("UnauthorizedAccess: cannot run script"));

    const execution = await h.runner.runStep(runOptions("setup", "win32"));
    assert.strictEqual(h.runner.classifyFailure(execution)?.category, "Permission");
  });

  test("a script rejecting -Interactive is reported as a Configuration mismatch", async () => {
    // Guards the extension/script contract: if a workspace ships an older
    // Setup-Environment.ps1 without the switch, the operator gets a precise
    // message instead of a generic non-zero exit.
    const h = harness();
    h.processRunner
      .respondTo("exit 0", ok(""))
      .fallback(
        withStderr("A parameter cannot be found that matches parameter name 'Interactive'.")
      );

    const execution = await h.runner.runStep(runOptions("setup", "win32"));
    const error = h.runner.classifyFailure(execution);

    assert.strictEqual(error?.category, "Configuration");
    assert.ok(error?.message.includes("-Interactive"));
  });

  test("an unexpected non-zero exit code is not a hard failure and falls through to the state machine", async () => {
    // The script contract only defines 0 and 1. Anything else degrades to
    // "not validated" rather than crashing the run.
    const h = harness();
    h.processRunner.fallback(crashed(2));

    const execution = await h.runner.runStep(runOptions("check", "linux"));

    assert.strictEqual(h.runner.classifyFailure(execution), undefined);
    assert.strictEqual(execution.result.exitCode, 2);
  });
});

suite("Unit: PrerequisiteRunnerService — environment probes", () => {
  test("jq is probed before any shell script runs on Unix", async () => {
    const h = harness();
    h.processRunner.respondTo("jq", ok(""));

    await h.runner.ensureEnvironment("linux", WORKSPACE_ROOT.fsPath);

    assert.strictEqual(h.processRunner.callsMatching("jq --version").length, 1);
    assert.strictEqual(h.processRunner.scriptCalls.length, 0, "no script may run during the probe");
  });

  test("missing jq raises a Configuration error with install remediation", async () => {
    const h = harness();
    h.processRunner.respondTo("jq", spawnFailed("ENOENT"));

    const error = await captureErrorAsync(() => h.runner.ensureEnvironment("darwin", WORKSPACE_ROOT.fsPath));

    assert.strictEqual(error.category, "Configuration");
    assert.ok(error.message.includes("jq"));
    assert.ok((error.remediation ?? "").includes("brew install jq"));
    assert.ok((error.remediation ?? "").includes("apt install jq"));
    assertNoAbsolutePaths(error.toUserMessage(), "missing jq");
  });

  test("a non-zero jq probe is also treated as missing", async () => {
    const h = harness();
    h.processRunner.respondTo("jq", crashed(127));

    const error = await captureErrorAsync(() => h.runner.ensureEnvironment("linux", WORKSPACE_ROOT.fsPath));
    assert.strictEqual(error.category, "Configuration");
  });

  test("the jq probe result is cached across calls", async () => {
    const h = harness();
    h.processRunner.respondTo("jq", ok(""));

    await h.runner.ensureEnvironment("linux", WORKSPACE_ROOT.fsPath);
    await h.runner.ensureEnvironment("linux", WORKSPACE_ROOT.fsPath);

    assert.strictEqual(h.processRunner.callsMatching("jq --version").length, 1);
  });

  test("jq is never probed on Windows", async () => {
    const h = harness();
    h.processRunner.respondTo("exit 0", ok(""));

    await h.runner.ensureEnvironment("win32", WORKSPACE_ROOT.fsPath);

    assert.strictEqual(h.processRunner.callsMatching("jq").length, 0);
  });

  test("pwsh is preferred over powershell.exe", async () => {
    const h = harness();
    h.processRunner.respondTo("pwsh", ok("")).respondTo("powershell.exe", ok(""));

    await h.runner.ensureEnvironment("win32", WORKSPACE_ROOT.fsPath);

    assert.strictEqual(h.processRunner.calls[0].command, "pwsh");
    assert.strictEqual(h.processRunner.callsMatching("powershell.exe").length, 0);
  });

  test("powershell.exe is used when pwsh is unavailable", async () => {
    const h = harness();
    h.processRunner.respondTo("pwsh", spawnFailed("ENOENT")).respondTo("powershell.exe", ok(""));

    await h.runner.ensureEnvironment("win32", WORKSPACE_ROOT.fsPath);

    assert.strictEqual(h.processRunner.callsMatching("powershell.exe").length, 1);
  });

  test("no PowerShell host at all raises a NotFound error", async () => {
    const h = harness();
    h.processRunner.respondTo("pwsh", spawnFailed()).respondTo("powershell.exe", spawnFailed());

    const error = await captureErrorAsync(() => h.runner.ensureEnvironment("win32", WORKSPACE_ROOT.fsPath));

    assert.strictEqual(error.category, "NotFound");
    assert.ok((error.remediation ?? "").includes("pwsh"));
  });

  test("the resolved PowerShell host is cached across steps", async () => {
    const h = harness();
    h.processRunner.respondTo("exit 0", ok("")).fallback(ok());

    await h.runner.ensureEnvironment("win32", WORKSPACE_ROOT.fsPath);
    await h.runner.runStep(runOptions("check", "win32"));
    await h.runner.runStep(runOptions("validate", "win32"));

    assert.strictEqual(h.processRunner.callsMatching("exit 0").length, 1, "the host is probed once");
  });
});

suite("Unit: PrerequisiteRunnerService — cancellation", () => {
  test("the cancellation token is forwarded to the process runner", async () => {
    const h = harness();
    h.processRunner.fallback(ok());
    const source = new vscode.CancellationTokenSource();

    await h.runner.runStep({ ...runOptions("check", "linux"), cancellationToken: source.token });

    assert.strictEqual(h.processRunner.scriptCalls[0].options.cancellationToken, source.token);
    source.dispose();
  });

  test("an already-cancelled token is still forwarded rather than ignored", async () => {
    const h = harness();
    h.processRunner.fallback(ok());
    const source = new vscode.CancellationTokenSource();
    source.cancel();

    await h.runner.runStep({ ...runOptions("check", "linux"), cancellationToken: source.token });

    assert.strictEqual(h.processRunner.scriptCalls[0].options.cancellationToken?.isCancellationRequested, true);
    source.dispose();
  });
});
