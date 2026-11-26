/**
 * Tests for MarkitdownConversionService
 * Host-side conversion service backed by a Python subprocess (microsoft/markitdown).
 *
 * `child_process.spawn` is ALWAYS stubbed via Sinon in this file — a real Python
 * process is never spawned, since CI has no guarantee Python/markitdown is installed.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as sinon from "sinon";
import * as childProcess from "child_process";
import { EventEmitter } from "events";
import { MarkitdownConversionService } from "../../src/features/convert-to-markdown/markitdownConversionService";
import { LoggingService } from "../../src/shared/services/loggingService";
import { SettingsManager } from "../../src/core/settingsManager";

/** Minimal fake `ChildProcess` shape, just enough for the service under test. */
interface FakeChildProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: sinon.SinonStub;
}

function createFakeChild(): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = sinon.stub();
  return child;
}

/** A child that closes (asynchronously, on next tick) with the given exit code. */
function createClosingChild(exitCode: number | null): FakeChildProcess {
  const child = createFakeChild();
  process.nextTick(() => child.emit("close", exitCode));
  return child;
}

/** A child that emits an `error` event (asynchronously) instead of closing. */
function createErroringChild(error: Error): FakeChildProcess {
  const child = createFakeChild();
  process.nextTick(() => child.emit("error", error));
  return child;
}

/** A child that streams stdout then closes with exit code 0 — a successful conversion. */
function createSuccessfulChild(stdout: string): FakeChildProcess {
  const child = createFakeChild();
  process.nextTick(() => {
    child.stdout.emit("data", Buffer.from(stdout, "utf8"));
    child.emit("close", 0);
  });
  return child;
}

/** A child that never emits close/error on its own — used to test the timeout paths. */
function createHangingChild(): FakeChildProcess {
  return createFakeChild();
}

suite("Unit: MarkitdownConversionService", () => {
  let service: MarkitdownConversionService;
  let spawnStub: sinon.SinonStub;
  let mkdtempStub: sinon.SinonStub;
  let writeFileStub: sinon.SinonStub;
  let rmSyncStub: sinon.SinonStub;
  let loggingStub: sinon.SinonStubbedInstance<LoggingService>;
  let pythonPathStub: sinon.SinonStub;

  setup(() => {
    spawnStub = sinon.stub(childProcess, "spawn") as unknown as sinon.SinonStub;
    mkdtempStub = sinon.stub(fs, "mkdtempSync").returns("C:\\Fake\\Temp\\nexkit-convert-default");
    writeFileStub = sinon.stub(fs, "writeFileSync");
    rmSyncStub = sinon.stub(fs, "rmSync");
    loggingStub = sinon.createStubInstance(LoggingService);
    pythonPathStub = sinon.stub(SettingsManager, "getConvertToMarkdownPythonPath").returns("");

    service = new MarkitdownConversionService(loggingStub as unknown as LoggingService);
  });

  teardown(() => {
    sinon.restore();
  });

  /** Warms the availability cache with an immediate success, then clears spawn call history. */
  async function warmAvailabilityCache(): Promise<void> {
    spawnStub.callsFake(() => createClosingChild(0));
    const result = await service.checkAvailability();
    assert.deepStrictEqual(result, { available: true });
    spawnStub.resetHistory();
  }

  suite("checkAvailability", () => {
    test("resolves available:true when the first candidate interpreter succeeds, and caches the result", async () => {
      spawnStub.callsFake(() => createClosingChild(0));

      const first = await service.checkAvailability();
      assert.deepStrictEqual(first, { available: true });
      assert.strictEqual(spawnStub.callCount, 1, "only the first candidate should have been probed");

      const second = await service.checkAvailability();
      assert.deepStrictEqual(second, { available: true });
      assert.strictEqual(spawnStub.callCount, 1, "a cached result must not spawn a second probe");
    });

    test("re-probes after invalidateAvailabilityCache() is called", async () => {
      spawnStub.callsFake(() => createClosingChild(0));

      await service.checkAvailability();
      assert.strictEqual(spawnStub.callCount, 1);

      service.invalidateAvailabilityCache();
      await service.checkAvailability();
      assert.strictEqual(spawnStub.callCount, 2, "invalidating the cache must trigger a fresh probe");
    });

    test("resolves available:false with a non-empty, path-free reason when every candidate interpreter fails", async () => {
      spawnStub.callsFake(() => createClosingChild(1));

      const result = await service.checkAvailability();

      assert.strictEqual(result.available, false);
      assert.strictEqual(spawnStub.callCount, 3, "all three fallback interpreters (python3, python, py) should be tried");
      assert.ok(result.reason && result.reason.length > 0, "a failure reason must be provided");
      assert.ok(!/[A-Za-z]:\\|\/(tmp|home|Users)\//.test(result.reason ?? ""), "reason must not leak local file paths");
    });

    test("treats a spawn 'error' event the same as a non-zero exit code", async () => {
      spawnStub.callsFake(() => createErroringChild(new Error("ENOENT")));

      const result = await service.checkAvailability();

      assert.strictEqual(result.available, false);
      assert.strictEqual(spawnStub.callCount, 3);
    });

    test("uses only the configured Python interpreter when SettingsManager returns one, without falling back", async () => {
      pythonPathStub.returns("/opt/custom/bin/python");
      spawnStub.callsFake(() => createClosingChild(0));

      const result = await service.checkAvailability();

      assert.deepStrictEqual(result, { available: true });
      assert.strictEqual(spawnStub.callCount, 1, "no fallback to python3/python/py once a path is configured");
      const [command] = spawnStub.getCall(0).args;
      assert.strictEqual(command, "/opt/custom/bin/python");
    });

    test("reports a failure that references the configured path when it does not work", async () => {
      pythonPathStub.returns("/opt/custom/bin/python");
      spawnStub.callsFake(() => createClosingChild(1));

      const result = await service.checkAvailability();

      assert.strictEqual(result.available, false);
      assert.strictEqual(spawnStub.callCount, 1, "the configured interpreter must not fall back to other candidates");
      assert.ok(result.reason?.includes("/opt/custom/bin/python"));
    });
  });

  suite("spawn security — argv array, no shell", () => {
    test("never invokes spawn with shell:true and always passes arguments as an array", async () => {
      spawnStub.callsFake(() => createClosingChild(0));
      await service.checkAvailability();

      mkdtempStub.returns("C:\\Fake\\Temp\\nexkit-convert-argv");
      spawnStub.resetHistory();
      spawnStub.callsFake(() => createSuccessfulChild("# converted"));
      await service.convertText("hello world");

      assert.ok(spawnStub.called, "expected at least one spawn call to inspect");
      for (const call of spawnStub.getCalls()) {
        const [command, args, options] = call.args as [string, unknown, { shell?: boolean } | undefined];
        assert.strictEqual(typeof command, "string");
        assert.ok(Array.isArray(args), "spawn arguments must be a plain array, never a concatenated command string");
        assert.notStrictEqual(options?.shell, true, "spawn must never be invoked with shell:true");
      }
    });
  });

  suite("forced UTF-8 subprocess encoding", () => {
    test("passes PYTHONIOENCODING and PYTHONUTF8 in the environment when probing an interpreter", async () => {
      spawnStub.callsFake(() => createClosingChild(0));
      await service.checkAvailability();

      assert.strictEqual(spawnStub.callCount, 1);
      const [, , options] = spawnStub.getCall(0).args as [string, unknown, { env?: NodeJS.ProcessEnv } | undefined];
      assert.strictEqual(options?.env?.PYTHONIOENCODING, "utf-8");
      assert.strictEqual(options?.env?.PYTHONUTF8, "1");
    });

    test("passes PYTHONIOENCODING and PYTHONUTF8 in the environment when running markitdown, while preserving the rest of process.env", async () => {
      await warmAvailabilityCache();
      mkdtempStub.returns("C:\\Fake\\Temp\\nexkit-convert-env");
      spawnStub.callsFake(() => createSuccessfulChild("# converted"));

      await service.convertText("hello world");

      assert.strictEqual(spawnStub.callCount, 1);
      const [, , options] = spawnStub.getCall(0).args as [string, unknown, { env?: NodeJS.ProcessEnv } | undefined];
      assert.strictEqual(options?.env?.PYTHONIOENCODING, "utf-8");
      assert.strictEqual(options?.env?.PYTHONUTF8, "1");
      const envKeyCount = Object.keys(options?.env ?? {}).length;
      const processEnvKeyCount = Object.keys(process.env).length;
      assert.ok(
        envKeyCount >= processEnvKeyCount,
        "the inherited process.env must still be present alongside the forced UTF-8 overrides"
      );
    });
  });


  suite("10MB input cap", () => {
    const overLimitContent = "a".repeat(10 * 1024 * 1024 + 1);

    test("convertText rejects oversized content without ever calling spawn", async () => {
      await assert.rejects(() => service.convertText(overLimitContent), /10MB/);
      assert.strictEqual(spawnStub.callCount, 0);
    });

    test("convertHtml rejects oversized content without ever calling spawn", async () => {
      await assert.rejects(() => service.convertHtml(overLimitContent), /10MB/);
      assert.strictEqual(spawnStub.callCount, 0);
    });

    test("convertFile rejects oversized content without ever calling spawn", async () => {
      const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
      await assert.rejects(() => service.convertFile("report.docx", oversized), /10MB/);
      assert.strictEqual(spawnStub.callCount, 0);
    });
  });

  suite("temp file cleanup", () => {
    test("cleans up the temp dir exactly once on the success path", async () => {
      await warmAvailabilityCache();
      const tempDir = "C:\\Fake\\Temp\\nexkit-convert-success";
      mkdtempStub.returns(tempDir);
      spawnStub.callsFake(() => createSuccessfulChild("# hello"));

      const result = await service.convertText("hello");

      assert.strictEqual(result, "# hello");
      assert.ok(writeFileStub.calledOnce);
      assert.ok(rmSyncStub.calledOnceWithExactly(tempDir, { recursive: true, force: true }));
    });

    test("cleans up the temp dir exactly once when the process exits with a non-zero code", async () => {
      await warmAvailabilityCache();
      const tempDir = "C:\\Fake\\Temp\\nexkit-convert-error-exit";
      mkdtempStub.returns(tempDir);
      spawnStub.callsFake(() => createClosingChild(1));

      await assert.rejects(() => service.convertText("hello"));

      assert.ok(rmSyncStub.calledOnceWithExactly(tempDir, { recursive: true, force: true }));
    });

    test("cleans up the temp dir exactly once when spawn emits an 'error' event", async () => {
      await warmAvailabilityCache();
      const tempDir = "C:\\Fake\\Temp\\nexkit-convert-error-spawn";
      mkdtempStub.returns(tempDir);
      spawnStub.callsFake(() => createErroringChild(new Error("spawn ENOENT")));

      await assert.rejects(() => service.convertText("hello"));

      assert.ok(rmSyncStub.calledOnceWithExactly(tempDir, { recursive: true, force: true }));
    });
  });

  suite("two-layer timeout", () => {
    test("sends SIGTERM at the soft timeout and SIGKILL after the hard-timeout grace period, then cleans up", async () => {
      await warmAvailabilityCache();
      const tempDir = "C:\\Fake\\Temp\\nexkit-convert-timeout";
      mkdtempStub.returns(tempDir);

      const hangingChild = createHangingChild();
      spawnStub.callsFake(() => hangingChild);

      const clock = sinon.useFakeTimers();
      try {
        const pending = service.convertText("hello");

        // Advance past the soft timeout: expect a graceful SIGTERM first.
        await clock.tickAsync(30_000);
        assert.ok(hangingChild.kill.calledWith("SIGTERM"), "expected SIGTERM at the soft timeout");
        assert.ok(!hangingChild.kill.calledWith("SIGKILL"), "SIGKILL must not fire before the hard-timeout grace period");

        // Advance past the hard-timeout grace period: expect a forceful SIGKILL.
        await clock.tickAsync(5_000);
        assert.ok(hangingChild.kill.calledWith("SIGKILL"), "expected SIGKILL after the hard-timeout grace period");

        // Simulate the killed process finally closing so the pipeline's promise settles.
        hangingChild.emit("close", null);
        await assert.rejects(() => pending);
      } finally {
        clock.restore();
      }

      assert.ok(rmSyncStub.calledOnceWithExactly(tempDir, { recursive: true, force: true }));
    });
  });

  suite("sanitized error messages", () => {
    test("never surfaces the temp directory path or a stack trace to the caller; raw detail only reaches LoggingService.error", async () => {
      await warmAvailabilityCache();
      const tempDir = "C:\\Fake\\Temp\\nexkit-convert-sanitized-secret";
      mkdtempStub.returns(tempDir);
      spawnStub.callsFake(() => createClosingChild(1));

      await assert.rejects(
        () => service.convertText("hello"),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.ok(!error.message.includes(tempDir), "the thrown error must not leak the temp directory path");
          assert.ok(!error.message.includes("\n    at "), "the thrown error must not include a stack trace");
          return true;
        }
      );

      assert.ok(loggingStub.error.called, "low-level failure detail must be logged via LoggingService.error");
    });
  });
});
