/**
 * Tests for SquadCliService (SQD-005): allowlist enforcement, invocation
 * resolution, timeouts, cancellation and actionable error mapping.
 *
 * The process runner is fully faked so no real Squad CLI process is spawned.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SquadCliSource } from "../../src/features/squad/models";
import {
  SquadCliCommand,
  SquadCliService,
} from "../../src/features/squad/services/squadCliService";
import type {
  SquadProcessRunner,
  SquadSpawnRequest,
  SquadSpawnResult,
} from "../../src/features/squad/services/squadProcessRunner";
import type {
  SquadLongRunningLauncher,
  SquadLongRunningListeners,
  SquadLongRunningSpawnRequest,
} from "../../src/features/squad/services/squadLongRunningProcess";

/** Build a fake runner resolving a canned result and recording the request. */
function fakeRunner(
  result: Partial<SquadSpawnResult>,
  captured: { request?: SquadSpawnRequest } = {}
): SquadProcessRunner {
  return {
    run: (request: SquadSpawnRequest): Promise<SquadSpawnResult> => {
      captured.request = request;
      return Promise.resolve({
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        cancelled: false,
        ...result,
      });
    },
  };
}

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

suite("Unit: SquadCliService", () => {
  suite("invocation resolution (FR-004)", () => {
    test("Should invoke the global executable directly", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "1.2.3" }, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Version);

      assert.strictEqual(result.ok, true);
      assert.strictEqual(captured.request?.command, "squad");
      assert.deepStrictEqual(captured.request?.args, ["version"]);
    });

    test("Should invoke via npx with the package and --yes", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "1.2.3" }, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Npx,
      });

      await service.execute(SquadCliCommand.Version);

      assert.strictEqual(captured.request?.command, "npx");
      assert.deepStrictEqual(captured.request?.args, [
        "--yes",
        "@bradygaster/squad-cli",
        "version",
      ]);
    });

    test("Should invoke the configured custom path", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "1.2.3" }, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Custom,
        customCliPath: "/opt/squad/bin/squad",
      });

      await service.execute(SquadCliCommand.Version);

      assert.strictEqual(captured.request?.command, "/opt/squad/bin/squad");
    });

    test("Should fail with cli-not-found when custom path is empty", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({}),
        logger: silentLogger,
        cliSource: SquadCliSource.Custom,
        customCliPath: "   ",
      });

      const result = await service.execute(SquadCliCommand.Version);

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-not-found");
        assert.ok(result.error.remediation);
      }
    });
  });

  suite("command building", () => {
    test("Should build `upgrade --self` for UpgradeSelf (FR-005)", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({}, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      await service.execute(SquadCliCommand.UpgradeSelf, { args: ["--yes"] });

      assert.deepStrictEqual(captured.request?.args, ["upgrade", "--self", "--yes"]);
    });

    test("Should append allowed operands and flags for upstream", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({}, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      await service.execute(SquadCliCommand.Upstream, { args: ["add", "team", "--yes"] });

      assert.deepStrictEqual(captured.request?.args, ["upstream", "add", "team", "--yes"]);
    });

    test("Should allow --name and --ref for upstream add (SQD-036)", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({}, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Upstream, {
        args: ["add", "org/repo", "--name", "org", "--ref", "main"],
      });

      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(captured.request?.args, ["upstream", "add", "org/repo", "--name", "org", "--ref", "main"]);
    });

    test("Should allow plugin list JSON output for inventory reads", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "[]" }, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      await service.execute(SquadCliCommand.Plugin, { args: ["list", "--json"] });

      assert.deepStrictEqual(captured.request?.args, ["plugin", "list", "--json"]);
    });

    test("Should pass cwd fsPath to the runner", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "1.0.0" }, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const cwd = vscode.Uri.file("/tmp/workspace");
      await service.execute(SquadCliCommand.Version, { cwd });

      assert.strictEqual(captured.request?.cwd, cwd.fsPath);
    });

    test("Should reject `watch` from bounded execute", async () => {
      const runner = { run: sinon.stub() };
      const service = new SquadCliService({
        runner: runner as unknown as SquadProcessRunner,
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Watch, { args: ["--interval", "5"] });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-execution-failed");
        assert.match(result.error.message, /long-running/);
      }
      sinon.assert.notCalled(runner.run);
    });

    test("Should start `watch` through the long-running launcher", () => {
      const captured: { request?: SquadLongRunningSpawnRequest; listeners?: SquadLongRunningListeners } = {};
      const launcher: SquadLongRunningLauncher = {
        launch: (request, listeners) => {
          captured.request = request;
          captured.listeners = listeners;
          return { kill: () => undefined };
        },
      };
      const service = new SquadCliService({
        longRunningLauncher: launcher,
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = service.spawnLongRunning(
        SquadCliCommand.Watch,
        { args: ["--interval", "15"], cwd: vscode.Uri.file("/tmp/workspace") },
        {
          onSpawn: () => undefined,
          onStdout: () => undefined,
          onStderr: () => undefined,
          onError: () => undefined,
          onExit: () => undefined,
        }
      );

      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(captured.request?.args, ["watch", "--interval", "15"]);
      assert.ok(captured.listeners);
    });

    test("Should reject invalid `watch --interval` values without launching", () => {
      const launcher = { launch: sinon.stub() };
      const service = new SquadCliService({
        longRunningLauncher: launcher as unknown as SquadLongRunningLauncher,
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = service.spawnLongRunning(SquadCliCommand.Watch, { args: ["--interval", "soon"] }, {
        onSpawn: () => undefined,
        onStdout: () => undefined,
        onStderr: () => undefined,
        onError: () => undefined,
        onExit: () => undefined,
      });

      assert.strictEqual(result.ok, false);
      sinon.assert.notCalled(launcher.launch);
    });
  });

  suite("allowlist enforcement (no shell injection)", () => {
    test("Should reject a disallowed flag without spawning", async () => {
      const runner = { run: sinon.stub() };
      const service = new SquadCliService({
        runner: runner as unknown as SquadProcessRunner,
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Version, { args: ["--exec"] });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-execution-failed");
      }
      sinon.assert.notCalled(runner.run);
    });

    test("Should reject operands for a command that forbids them", async () => {
      const runner = { run: sinon.stub() };
      const service = new SquadCliService({
        runner: runner as unknown as SquadProcessRunner,
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Version, { args: ["evil"] });

      assert.strictEqual(result.ok, false);
      sinon.assert.notCalled(runner.run);
    });

    test("Should reject arguments containing control characters", async () => {
      const runner = { run: sinon.stub() };
      const service = new SquadCliService({
        runner: runner as unknown as SquadProcessRunner,
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Upstream, {
        args: ["add\nrm -rf /"],
      });

      assert.strictEqual(result.ok, false);
      sinon.assert.notCalled(runner.run);
    });
  });

  suite("failure mapping", () => {
    test("Should map ENOENT to cli-not-found with source-specific remediation", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ exitCode: null, spawnErrorCode: "ENOENT" }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Version);

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-not-found");
        assert.match(result.error.remediation ?? "", /npm install -g/);
      }
    });

    test("Should map timeout to cli-timeout", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ timedOut: true, exitCode: null }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Doctor, { timeoutMs: 5 });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-timeout");
        assert.strictEqual(result.error.detail, "timeoutMs=5");
      }
    });

    test("Should map non-zero exit to cli-execution-failed with stderr summary", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ exitCode: 2, stderr: "boom: something broke\nmore" }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Doctor);

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-execution-failed");
        assert.match(result.error.message, /boom: something broke/);
        assert.strictEqual(result.error.detail, "exitCode=2");
      }
    });

    test("Should map runner cancellation to cancelled", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ cancelled: true, exitCode: null }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.execute(SquadCliCommand.Doctor);

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cancelled");
      }
    });

    test("Should short-circuit when the token is already cancelled", async () => {
      const runner = { run: sinon.stub() };
      const service = new SquadCliService({
        runner: runner as unknown as SquadProcessRunner,
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });
      const source = new vscode.CancellationTokenSource();
      source.cancel();

      const result = await service.execute(SquadCliCommand.Doctor, { token: source.token });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cancelled");
      }
      sinon.assert.notCalled(runner.run);
    });
  });

  suite("getCliVersion (FR-003)", () => {
    test("Should parse a semver from stdout on success", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "squad version 0.13.2\n" }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.getCliVersion();

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, "0.13.2");
      }
    });

    test("Should return version-unknown when no version is present", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "no version here" }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.getCliVersion();

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "version-unknown");
      }
    });

    test("isCliAvailable should reflect a failed version probe", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ exitCode: null, spawnErrorCode: "ENOENT" }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      assert.strictEqual(await service.isCliAvailable(), false);
    });
  });

  suite("probeCli (FR-003, FR-004)", () => {
    test("Should return the parsed version and resolved source", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "squad version 1.4.0\n" }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.probeCli();

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.version, "1.4.0");
        assert.strictEqual(result.value.source, SquadCliSource.Global);
      }
    });

    test("Should honor a per-call source override without mutating the service", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "1.0.0" }, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.probeCli({ source: SquadCliSource.Npx });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.source, SquadCliSource.Npx);
      }
      // The override resolved an npx invocation for this call only.
      assert.strictEqual(captured.request?.command, "npx");
      assert.deepStrictEqual(captured.request?.args, [
        "--yes",
        "@bradygaster/squad-cli",
        "version",
      ]);
    });

    test("Should surface cli-not-found when the executable is missing", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ exitCode: null, spawnErrorCode: "ENOENT" }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.probeCli();

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-not-found");
      }
    });
  });

  suite("timeout selection", () => {
    test("Should use the command default timeout when not overridden", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "1.0.0" }, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      await service.execute(SquadCliCommand.Version);

      assert.strictEqual(captured.request?.timeoutMs, 15_000);
    });

    test("Should honour an explicit timeout override", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner({ stdout: "1.0.0" }, captured),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      await service.execute(SquadCliCommand.Version, { timeoutMs: 42 });

      assert.strictEqual(captured.request?.timeoutMs, 42);
    });
  });

  suite("runDoctor (SQD-021, FR-060)", () => {
    test("Should request --json and parse a structured report on success", async () => {
      const captured: { request?: SquadSpawnRequest } = {};
      const service = new SquadCliService({
        runner: fakeRunner(
          { stdout: JSON.stringify([{ label: "Node", severity: "ok" }]) },
          captured
        ),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.runDoctor();

      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(captured.request?.args, ["doctor", "--json"]);
      if (result.ok) {
        assert.strictEqual(result.value.structured, true);
        assert.strictEqual(result.value.checks[0].label, "Node");
      }
    });

    test("Should map a non-zero exit to a doctor-failed error", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ exitCode: 1, stderr: "boom" }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.runDoctor();

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "doctor-failed");
        assert.ok(result.error.remediation);
      }
    });

    test("Should surface a missing CLI unchanged", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ spawnErrorCode: "ENOENT" }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.runDoctor();

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-not-found");
      }
    });

    test("Should surface a timeout unchanged", async () => {
      const service = new SquadCliService({
        runner: fakeRunner({ timedOut: true }),
        logger: silentLogger,
        cliSource: SquadCliSource.Global,
      });

      const result = await service.runDoctor();

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-timeout");
      }
    });
  });
});
