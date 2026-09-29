import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SquadCliSource, SquadWatchState, squadErr } from "../../src/features/squad/models";
import { SquadCliService } from "../../src/features/squad/services/squadCliService";
import {
  SquadLongRunningHandle,
  SquadLongRunningLauncher,
  SquadLongRunningListeners,
  SquadLongRunningSpawnRequest,
} from "../../src/features/squad/services/squadLongRunningProcess";
import { SquadWatchService } from "../../src/features/squad/services/squadWatchService";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

class FakeLongRunningLauncher implements SquadLongRunningLauncher {
  public request: SquadLongRunningSpawnRequest | undefined;
  public listeners: SquadLongRunningListeners | undefined;
  public readonly kill = sinon.stub();

  public launch(
    request: SquadLongRunningSpawnRequest,
    listeners: SquadLongRunningListeners
  ): SquadLongRunningHandle {
    this.request = request;
    this.listeners = listeners;
    return { kill: this.kill };
  }
}

function createService(
  launcher: FakeLongRunningLauncher,
  options: { now?: () => number; defaultInterval?: number } = {}
): SquadWatchService {
  const cli = new SquadCliService({
    longRunningLauncher: launcher,
    cliSource: SquadCliSource.Global,
    logger: silentLogger,
  });
  return new SquadWatchService({
    cli,
    logger: silentLogger,
    now: options.now ?? (() => 100),
    getDefaultIntervalMinutes: () => options.defaultInterval ?? 10,
  });
}

const testCwd = vscode.Uri.file("C:\\work");

suite("Unit: SquadWatchService", () => {
  test("Should start the allowlisted `squad watch` process with the configured interval", () => {
    const launcher = new FakeLongRunningLauncher();
    const service = createService(launcher, { defaultInterval: 7 });
    const result = service.start({ cwd: testCwd });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(launcher.request?.command, "squad");
    assert.deepStrictEqual(launcher.request?.args, ["watch", "--interval", "7"]);
    assert.strictEqual(launcher.request?.cwd, testCwd.fsPath);
    assert.strictEqual(service.getSnapshot().status.state, SquadWatchState.Starting);
    assert.strictEqual(service.getSnapshot().status.intervalMinutes, 7);
  });

  test("Should transition to running when the process spawns", () => {
    const launcher = new FakeLongRunningLauncher();
    const service = createService(launcher);
    const snapshots: SquadWatchState[] = [];
    service.onDidChangeSnapshot((snapshot) => snapshots.push(snapshot.status.state));

    service.start({ cwd: testCwd, intervalMinutes: 3 });
    launcher.listeners?.onSpawn();

    assert.strictEqual(service.getSnapshot().status.state, SquadWatchState.Running);
    assert.ok(snapshots.includes(SquadWatchState.Starting));
    assert.ok(snapshots.includes(SquadWatchState.Running));
  });

  test("Should keep a sanitized bounded log snapshot and surface unexpected exits as failures", () => {
    let now = 0;
    const launcher = new FakeLongRunningLauncher();
    const service = createService(launcher, { now: () => ++now });

    service.start({ cwd: testCwd, intervalMinutes: 5 });
    launcher.listeners?.onSpawn();
    launcher.listeners?.onStdout("ready \x1b[31mred\x1b[0m\npartial");
    launcher.listeners?.onStderr("warn\n");
    launcher.listeners?.onExit(2, null);

    const snapshot = service.getSnapshot();
    assert.strictEqual(snapshot.status.state, SquadWatchState.Failed);
    assert.strictEqual(snapshot.status.error?.code, "watch-failed");
    assert.ok(snapshot.logs.some((entry) => entry.stream === "stdout" && entry.text === "ready red"));
    assert.ok(snapshot.logs.some((entry) => entry.stream === "stdout" && entry.text === "partial"));
    assert.ok(snapshot.logs.some((entry) => entry.stream === "stderr" && entry.text === "warn"));
  });

  test("Should stop the running process gracefully and mark the process stopped after exit", () => {
    const launcher = new FakeLongRunningLauncher();
    const service = createService(launcher);

    service.start({ cwd: testCwd });
    launcher.listeners?.onSpawn();
    const stop = service.stop();

    assert.strictEqual(stop.ok, true);
    assert.ok(launcher.kill.calledOnceWithExactly(false));
    assert.strictEqual(service.getSnapshot().status.state, SquadWatchState.Stopping);

    launcher.listeners?.onExit(null, "SIGTERM");

    const snapshot = service.getSnapshot();
    assert.strictEqual(snapshot.status.state, SquadWatchState.Stopped);
    assert.strictEqual(snapshot.status.signal, "SIGTERM");
    assert.strictEqual(snapshot.status.error, null);
  });

  test("Should reject invalid intervals without spawning a process", () => {
    const launcher = new FakeLongRunningLauncher();
    const service = createService(launcher);

    const result = service.start({ intervalMinutes: 0 });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "invalid-input");
    }
    assert.strictEqual(launcher.request, undefined);
    assert.strictEqual(service.getSnapshot().status.state, SquadWatchState.Failed);
  });

  test("Should reject starts without a workspace cwd", () => {
    const launcher = new FakeLongRunningLauncher();
    const service = createService(launcher);

    const result = service.start();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "not-a-workspace");
    }
    assert.strictEqual(launcher.request, undefined);
  });

  test("Should reject duplicate starts while watch is active", () => {
    const launcher = new FakeLongRunningLauncher();
    const service = createService(launcher);

    service.start({ cwd: testCwd });
    const result = service.start({ cwd: testCwd });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "watch-already-running");
    }
  });

  test("Should surface spawn errors as actionable failures", () => {
    const cli = {
      spawnLongRunning: () =>
        squadErr({
          code: "cli-not-found",
          message: "missing",
          remediation: "install",
        }),
    } as unknown as SquadCliService;
    const service = new SquadWatchService({
      cli,
      logger: silentLogger,
      getDefaultIntervalMinutes: () => 10,
    });

    const result = service.start({ cwd: testCwd });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(service.getSnapshot().status.state, SquadWatchState.Failed);
    assert.strictEqual(service.getSnapshot().status.error?.code, "cli-not-found");
  });

  test("Dispose should force-kill a running process", () => {
    const launcher = new FakeLongRunningLauncher();
    const service = createService(launcher);

    service.start({ cwd: testCwd });
    service.dispose();

    assert.ok(launcher.kill.calledOnceWithExactly(true));
  });
});
