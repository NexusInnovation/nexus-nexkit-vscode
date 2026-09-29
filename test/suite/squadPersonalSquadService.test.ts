import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  SquadPersonalSquadConfirmer,
  SquadPersonalSquadFileSystem,
  SquadPersonalSquadService,
} from "../../src/features/squad/services/squadPersonalSquadService";
import { SquadCliService } from "../../src/features/squad/services/squadCliService";
import {
  SquadPersonalSquadState,
  SquadResult,
  SquadRosterMember,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

const PERSONAL_ROOT = vscode.Uri.file(path.join(path.sep === "\\" ? "C:\\" : "/", "Users", "Link"));

function silentLogger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  } as never;
}

interface Deps {
  exists: sinon.SinonStub<[vscode.Uri], Promise<boolean>>;
  readRoster: sinon.SinonStub<[], Promise<SquadResult<SquadRosterMember[]>>>;
  execute: sinon.SinonStub;
  confirm: sinon.SinonStub;
  service: SquadPersonalSquadService;
}

function createService(options: Partial<{
  markerExists: boolean;
  markerThrows: Error;
  rosterResult: SquadResult<SquadRosterMember[]>;
  executeResult: unknown;
  confirm: boolean;
  existsSequence: boolean[];
}> = {}): Deps {
  const exists = sinon.stub<[vscode.Uri], Promise<boolean>>();
  if (options.markerThrows) {
    exists.rejects(options.markerThrows);
  } else if (options.existsSequence) {
    options.existsSequence.forEach((value, index) => {
      exists.onCall(index).resolves(value);
    });
  } else {
    exists.resolves(options.markerExists ?? false);
  }

  const readRoster = sinon.stub<[], Promise<SquadResult<SquadRosterMember[]>>>().resolves(
    options.rosterResult ??
      squadOk([
        {
          id: "link",
          name: "Link",
          role: "TypeScript",
          summary: "Extension dev",
          hasCharter: true,
        },
      ])
  );
  const execute = sinon.stub().resolves(
    options.executeResult ??
      squadOk({
        command: "init",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        durationMs: 1,
      })
  );
  const confirm = sinon.stub().resolves(options.confirm ?? true);

  const fileSystem: SquadPersonalSquadFileSystem = { exists };
  const confirmer: SquadPersonalSquadConfirmer = { confirm };

  const service = new SquadPersonalSquadService({
    cli: { execute } as unknown as SquadCliService,
    confirmer,
    fileSystem,
    createFileService: () => ({ readRoster }),
    getPersonalRoot: () => PERSONAL_ROOT,
    logger: silentLogger(),
  });

  return { exists, readRoster, execute, confirm, service };
}

suite("Unit: SquadPersonalSquadService (SQD-051 personal squad)", () => {
  test("getStatus returns not-initialized when the personal marker is absent", async () => {
    const deps = createService({ markerExists: false });

    const result = await deps.service.getStatus();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.state, SquadPersonalSquadState.NotInitialized);
    assert.strictEqual(result.value.memberCount, 0);
    assert.strictEqual(result.value.markerRelativePath, ".squad/team.md");
    assert.match(result.value.warning, /outside the current workspace/i);
    assert.ok(deps.readRoster.notCalled);
  });

  test("getStatus reads the roster through SquadFileService when the marker exists", async () => {
    const deps = createService({ markerExists: true });

    const result = await deps.service.getStatus();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.state, SquadPersonalSquadState.Initialized);
    assert.strictEqual(result.value.memberCount, 1);
    assert.strictEqual(result.value.roster[0].id, "link");
    assert.ok(deps.readRoster.calledOnce);
  });

  test("getStatus surfaces malformed personal roster as an actionable failure", async () => {
    const deps = createService({
      markerExists: true,
      rosterResult: squadErr({ code: "parse-failed", message: "bad team", remediation: "Fix team.md." }),
    });

    const result = await deps.service.getStatus();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "parse-failed");
      assert.ok(result.error.remediation);
    }
  });

  test("getStatus maps marker read errors to file-read-failed", async () => {
    const deps = createService({ markerThrows: new Error("EACCES") });

    const result = await deps.service.getStatus();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "file-read-failed");
      assert.strictEqual(result.error.detail, ".squad/team.md");
      assert.ok(result.error.remediation);
    }
  });

  test("initialize returns existing status without running the CLI when already initialized", async () => {
    const deps = createService({ markerExists: true });

    const result = await deps.service.initialize();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.alreadyInitialized, true);
    assert.ok(deps.confirm.notCalled);
    assert.ok(deps.execute.notCalled);
  });

  test("initialize requires confirmation before running global init", async () => {
    const deps = createService({ markerExists: false, confirm: false });

    const result = await deps.service.initialize();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cancelled");
    }
    assert.ok(deps.confirm.calledOnce);
    assert.ok(deps.execute.notCalled);
  });

  test("initialize runs squad init --global --yes and re-detects personal status", async () => {
    const deps = createService({ existsSequence: [false, true] });

    const result = await deps.service.initialize();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.alreadyInitialized, false);
    assert.strictEqual(result.value.status.state, SquadPersonalSquadState.Initialized);
    assert.strictEqual(result.value.stdout, "ok");
    assert.ok(deps.execute.calledOnce);
    assert.deepStrictEqual(deps.execute.firstCall.args, ["init", { args: ["--global", "--yes"] }]);
  });

  test("initialize surfaces CLI failures verbatim", async () => {
    const deps = createService({
      markerExists: false,
      executeResult: squadErr({ code: "cli-not-found", message: "missing", remediation: "Install Squad CLI." }),
    });

    const result = await deps.service.initialize();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cli-not-found");
      assert.ok(result.error.remediation);
    }
  });

  test("initialize fails when CLI succeeds but the personal marker is still missing", async () => {
    const deps = createService({ existsSequence: [false, false] });

    const result = await deps.service.initialize();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cli-execution-failed");
      assert.match(result.error.message, /could not find/i);
    }
  });
});
