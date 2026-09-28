import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import type { LoggingService } from "../../src/shared/services/loggingService";
import { SquadCliCommand, SquadCliService } from "../../src/features/squad/services/squadCliService";
import { SquadExportService } from "../../src/features/squad/services/squadExportService";
import { SquadTransferTargetKind, squadErr, squadOk } from "../../src/features/squad/models";

const WORKSPACE_ROOT = vscode.Uri.file(path.join(path.sep === "\\" ? "C:\\" : "/", "ws"));
const EXPORT_FILE = vscode.Uri.file(path.join(WORKSPACE_ROOT.fsPath, "squad-export.json"));

function silentLogger(): LoggingService {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as unknown as LoggingService;
}

function createService(overrides: Partial<{
  execute: sinon.SinonStub;
  showSaveDialog: sinon.SinonStub;
  workspaceRoot: vscode.Uri | undefined;
}> = {}): {
  service: SquadExportService;
  execute: sinon.SinonStub;
  showSaveDialog: sinon.SinonStub;
} {
  const execute = overrides.execute ?? sinon.stub().resolves(
    squadOk({
      command: SquadCliCommand.Export,
      exitCode: 0,
      stdout: "exported",
      stderr: "",
      durationMs: 25,
    })
  );
  const showSaveDialog = overrides.showSaveDialog ?? sinon.stub().resolves(EXPORT_FILE);

  return {
    service: new SquadExportService({
      cli: { execute } as unknown as SquadCliService,
      logger: silentLogger(),
      filePicker: { showSaveDialog },
      getWorkspaceRoot: () =>
        Object.prototype.hasOwnProperty.call(overrides, "workspaceRoot")
          ? overrides.workspaceRoot
          : WORKSPACE_ROOT,
      now: () => 1234,
    }),
    execute,
    showSaveDialog,
  };
}

suite("Unit: SquadExportService (SQD-033 export)", () => {
  test("prompts for a file and runs `squad export --output`", async () => {
    const { service, execute, showSaveDialog } = createService();

    const result = await service.exportSquad();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.exportedAt, 1234);
    assert.strictEqual(result.value.target.kind, SquadTransferTargetKind.File);
    assert.strictEqual(result.value.stdout, "exported");
    assert.ok(showSaveDialog.calledOnce);
    assert.ok(
      execute.calledOnceWithExactly(SquadCliCommand.Export, {
        cwd: WORKSPACE_ROOT,
        args: ["--output", EXPORT_FILE.fsPath],
      })
    );
  });

  test("uses a provided file URI without showing a save dialog", async () => {
    const { service, execute, showSaveDialog } = createService();

    const result = await service.exportSquad({
      target: { kind: SquadTransferTargetKind.File, uri: EXPORT_FILE.toString() },
    });

    assert.strictEqual(result.ok, true);
    assert.ok(showSaveDialog.notCalled);
    assert.deepStrictEqual(execute.firstCall.args[1], {
      cwd: WORKSPACE_ROOT,
      args: ["--output", EXPORT_FILE.fsPath],
    });
  });

  test("returns cancelled when the file picker is dismissed", async () => {
    const { service, execute } = createService({
      showSaveDialog: sinon.stub().resolves(undefined),
    });

    const result = await service.exportSquad();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cancelled");
      assert.ok(result.error.remediation);
    }
    assert.ok(execute.notCalled);
  });

  test("returns not-a-workspace without invoking the CLI", async () => {
    const { service, execute } = createService({ workspaceRoot: undefined });

    const result = await service.exportSquad();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "not-a-workspace");
      assert.ok(result.error.remediation);
    }
    assert.ok(execute.notCalled);
  });

  test("surfaces CLI failures without a success-shaped result", async () => {
    const { service } = createService({
      execute: sinon.stub().resolves(
        squadErr({ code: "cli-timeout", message: "timed out", remediation: "retry later" })
      ),
    });

    const result = await service.exportSquad({
      target: { kind: SquadTransferTargetKind.File, uri: EXPORT_FILE.toString() },
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cli-timeout");
      assert.ok(result.error.remediation);
    }
  });

  test("builds a GitHub target invocation for CLI-supported exports", async () => {
    const { service, execute } = createService();

    const result = await service.exportSquad({
      target: {
        kind: SquadTransferTargetKind.GitHub,
        repository: "NexusInnovation/export-target",
        ref: "main",
        path: "squad/export.json",
      },
    });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(execute.firstCall.args[1], {
      cwd: WORKSPACE_ROOT,
      args: ["github", "NexusInnovation/export-target", "--ref", "main", "--path", "squad/export.json"],
    });
  });

  test("rejects malformed GitHub repository targets before invoking the CLI", async () => {
    const { service, execute } = createService();

    const result = await service.exportSquad({
      target: { kind: SquadTransferTargetKind.GitHub, repository: "not-a-repo" },
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cli-execution-failed");
      assert.ok(result.error.remediation);
    }
    assert.ok(execute.notCalled);
  });
});
