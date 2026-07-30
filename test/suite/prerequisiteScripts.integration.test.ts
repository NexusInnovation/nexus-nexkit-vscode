/**
 * Opt-in integration tests that execute real scripts through the real spawn path.
 *
 * These are skipped unless `NEXKIT_RUN_SCRIPT_TESTS=1`, because they require a
 * usable interpreter (bash + jq on Unix, PowerShell on Windows). CI sets the
 * variable on the ubuntu/windows/macos matrix.
 *
 * They deliberately run tiny purpose-built fixtures, never the workspace's real
 * prerequisite scripts, so a test can never install or modify anything.
 */

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { NodeFileSystem } from "../../src/features/prerequisite-automation/nodeFileSystem";
import { NodeProcessRunner } from "../../src/features/prerequisite-automation/nodeProcessRunner";
import { PrerequisiteRunnerService } from "../../src/features/prerequisite-automation/prerequisiteRunnerService";
import { PrerequisiteStep } from "../../src/features/prerequisite-automation/types";
import { FakeLogger } from "./helpers/prerequisiteTestHelpers";

const FIXTURE_ROOT = path.resolve(__dirname, "..", "..", "..", "test", "fixtures", "prerequisites");
const OK_SCRIPTS = vscode.Uri.file(path.join(FIXTURE_ROOT, "scripts-ok"));
const KO_SCRIPTS = vscode.Uri.file(path.join(FIXTURE_ROOT, "scripts-ko"));
const WORKSPACE = vscode.Uri.file(FIXTURE_ROOT);

function buildRunner(): { runner: PrerequisiteRunnerService; logger: FakeLogger } {
  const logger = new FakeLogger();
  const runner = new PrerequisiteRunnerService(new NodeProcessRunner(), logger, new NodeFileSystem());
  return { runner, logger };
}

function execute(runner: PrerequisiteRunnerService, step: PrerequisiteStep, scriptsRoot: vscode.Uri) {
  return runner.runStep({
    step,
    scriptsRoot,
    workspaceRoot: WORKSPACE,
    platform: process.platform,
    correlationId: "integration",
  });
}

suite("Integration: prerequisite scripts", function () {
  this.timeout(120_000);

  setup(function () {
    if (process.env.NEXKIT_RUN_SCRIPT_TESTS !== "1") {
      this.skip();
    }
  });

  test("the environment probe succeeds on the current platform", async () => {
    const { runner } = buildRunner();
    await runner.ensureEnvironment(process.platform, WORKSPACE.fsPath);
  });

  test("a passing check script reports validated through the real spawn path", async () => {
    const { runner } = buildRunner();
    await runner.ensureEnvironment(process.platform, WORKSPACE.fsPath);

    const execution = await execute(runner, "check", OK_SCRIPTS);

    assert.strictEqual(execution.result.outcome, "completed");
    assert.strictEqual(execution.result.exitCode, 0);
    assert.strictEqual(execution.validated, true, "the ::VALIDATED:: marker must survive the real pipe");
    assert.strictEqual(execution.markerConflict, false);
    assert.strictEqual(runner.classifyFailure(execution), undefined);
  });

  test("a failing check script reports a clean negative, not an error", async () => {
    const { runner } = buildRunner();
    await runner.ensureEnvironment(process.platform, WORKSPACE.fsPath);

    const execution = await execute(runner, "check", KO_SCRIPTS);

    assert.strictEqual(execution.result.exitCode, 1);
    assert.strictEqual(execution.validated, false);
    assert.strictEqual(execution.markerConflict, false);
    assert.strictEqual(runner.classifyFailure(execution), undefined);
  });

  test("the non-interactive switch is accepted by a contract-compliant validate script", async () => {
    // Guards the extension/script agreement: if the switch were rejected, a
    // real run would fail with a parameter-binding error instead of validating.
    const { runner } = buildRunner();
    await runner.ensureEnvironment(process.platform, WORKSPACE.fsPath);

    const execution = await execute(runner, "validate", OK_SCRIPTS);

    assert.strictEqual(execution.result.exitCode, 0, execution.result.stderr);
    assert.ok(!execution.result.stderr.includes("Interactive"), execution.result.stderr);
  });

  test("a failing validate script surfaces its exit code without hanging", async () => {
    const { runner } = buildRunner();
    await runner.ensureEnvironment(process.platform, WORKSPACE.fsPath);

    const execution = await execute(runner, "validate", KO_SCRIPTS);

    assert.strictEqual(execution.result.outcome, "completed");
    assert.strictEqual(execution.result.exitCode, 1);
  });

  test("a missing script is detected without spawning an interpreter", async () => {
    const { runner } = buildRunner();
    const empty = vscode.Uri.file(path.join(FIXTURE_ROOT, "scripts-absent"));

    const execution = await execute(runner, "check", empty);

    assert.strictEqual(execution.result.outcome, "scriptNotFound");
    assert.strictEqual(execution.result.exitCode, null);
    assert.strictEqual(runner.classifyFailure(execution)?.category, "NotFound");
  });

  test("cancellation terminates the child process", async () => {
    const { runner } = buildRunner();
    await runner.ensureEnvironment(process.platform, WORKSPACE.fsPath);

    const source = new vscode.CancellationTokenSource();
    const pending = runner.runStep({
      step: "setup",
      scriptsRoot: OK_SCRIPTS,
      workspaceRoot: WORKSPACE,
      platform: process.platform,
      correlationId: "integration-cancel",
      cancellationToken: source.token,
    });
    source.cancel();

    const execution = await pending;
    assert.ok(execution.result.durationMs >= 0, "the run must settle rather than hang");
    source.dispose();
  });
});
