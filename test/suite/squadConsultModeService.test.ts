import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  SquadConsultModeConfirmer,
  SquadConsultModeFileSystem,
  SquadConsultModeService,
} from "../../src/features/squad/services/squadConsultModeService";
import { SquadCliCommand, SquadCliService } from "../../src/features/squad/services/squadCliService";
import { SquadDetectionService } from "../../src/features/squad/services/squadDetectionService";
import { SquadArtifactBackup } from "../../src/features/squad/services/squadInitService";
import {
  SquadConsultModeOperation,
  SquadConsultModeState,
  SquadPersonalSquadScope,
  SquadPersonalSquadState,
  SquadPersonalSquadStatus,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

const WORKSPACE_ROOT = vscode.Uri.file(path.join(path.sep === "\\" ? "C:\\" : "/", "ws"));

function missingFile(): Error & { code: string } {
  return Object.assign(new Error("missing"), { code: "FileNotFound" });
}

function silentLogger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  } as never;
}

function personalStatus(state: SquadPersonalSquadState = SquadPersonalSquadState.Initialized): SquadPersonalSquadStatus {
  return {
    state,
    scope: SquadPersonalSquadScope.Personal,
    targetLabel: "your user profile (.squad/)",
    markerRelativePath: ".squad/team.md",
    warning: "Personal Squad lives outside the current workspace.",
    roster: state === SquadPersonalSquadState.Initialized ? [{ id: "link", name: "Link", hasCharter: true }] : [],
    memberCount: state === SquadPersonalSquadState.Initialized ? 1 : 0,
  };
}

interface Deps {
  service: SquadConsultModeService;
  getPersonalStatus: sinon.SinonStub;
  readFile: sinon.SinonStub<[vscode.Uri], Promise<string>>;
  confirm: sinon.SinonStub;
  backupSquadArtifacts: sinon.SinonStub;
  restoreSquadArtifacts: sinon.SinonStub;
  execute: sinon.SinonStub;
  detect: sinon.SinonStub;
}

function createService(
  options: Partial<{
    personal: SquadPersonalSquadStatus;
    personalError: boolean;
    configSequence: Array<string | Error>;
    confirm: boolean;
    backupPath: string | null;
    backupThrows: Error;
    executeResult: unknown;
  }> = {}
): Deps {
  const getPersonalStatus = sinon.stub();
  if (options.personalError) {
    getPersonalStatus.resolves(
      squadErr({ code: "file-read-failed", message: "personal denied", remediation: "Check permissions." })
    );
  } else {
    getPersonalStatus.resolves(squadOk(options.personal ?? personalStatus()));
  }

  const readFile = sinon.stub<[vscode.Uri], Promise<string>>();
  const sequence = options.configSequence ?? [missingFile()];
  sequence.forEach((entry, index) => {
    if (entry instanceof Error) {
      readFile.onCall(index).rejects(entry);
    } else {
      readFile.onCall(index).resolves(entry);
    }
  });
  readFile.callsFake(async () => {
    throw missingFile();
  });

  const confirm = sinon.stub().resolves(options.confirm ?? true);
  const backupSquadArtifacts = sinon.stub();
  if (options.backupThrows) {
    backupSquadArtifacts.rejects(options.backupThrows);
  } else {
    backupSquadArtifacts.resolves(options.backupPath ?? null);
  }
  const restoreSquadArtifacts = sinon.stub().resolves();
  const execute = sinon.stub().resolves(
    options.executeResult ??
      squadOk({
        command: SquadCliCommand.Consult,
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        durationMs: 5,
      })
  );
  const detect = sinon.stub().resolves(squadOk({ installed: true } as never));

  const fileSystem: SquadConsultModeFileSystem = { readFile };
  const confirmer: SquadConsultModeConfirmer = { confirm };
  const backup: SquadArtifactBackup = { backupSquadArtifacts, restoreSquadArtifacts };

  const service = new SquadConsultModeService({
    cli: { execute } as unknown as SquadCliService,
    personal: { getStatus: getPersonalStatus },
    backup,
    detection: { detect } as unknown as SquadDetectionService,
    confirmer,
    fileSystem,
    getWorkspaceRoot: () => WORKSPACE_ROOT,
    logger: silentLogger(),
  });

  return {
    service,
    getPersonalStatus,
    readFile,
    confirm,
    backupSquadArtifacts,
    restoreSquadArtifacts,
    execute,
    detect,
  };
}

suite("Unit: SquadConsultModeService (SQD-052 consult mode)", () => {
  test("getStatus returns inactive when config is missing and reuses personal detection", async () => {
    const deps = createService();

    const result = await deps.service.getStatus();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.state, SquadConsultModeState.Inactive);
    assert.strictEqual(result.value.markerRelativePath, ".squad/config.json");
    assert.deepStrictEqual(result.value.excludedRelativePaths, [".squad/", ".github/agents/squad.agent.md"]);
    assert.ok(deps.getPersonalStatus.calledOnce);
  });

  test("getStatus returns active when config contains consult true", async () => {
    const deps = createService({ configSequence: ['{"consult":true}'] });

    const result = await deps.service.getStatus();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.state, SquadConsultModeState.Active);
  });

  test("getStatus surfaces malformed consult config as parse-failed", async () => {
    const deps = createService({ configSequence: ['{"consult":"yes"}'] });

    const result = await deps.service.getStatus();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "parse-failed");
      assert.ok(result.error.remediation);
    }
  });

  test("startConsultMode requires initialized personal Squad before CLI", async () => {
    const deps = createService({ personal: personalStatus(SquadPersonalSquadState.NotInitialized) });

    const result = await deps.service.startConsultMode();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "invalid-input");
    }
    assert.ok(deps.confirm.notCalled);
    assert.ok(deps.execute.notCalled);
  });

  test("startConsultMode confirms, backs up, runs squad consult --yes and rechecks active status", async () => {
    const deps = createService({
      configSequence: [missingFile(), '{"consult":true}'],
      backupPath: path.join(path.sep === "\\" ? "C:\\" : "/", "backup", "squad-1"),
    });

    const result = await deps.service.startConsultMode();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.operation, SquadConsultModeOperation.Consult);
    assert.strictEqual(result.value.status.state, SquadConsultModeState.Active);
    assert.strictEqual(result.value.backupPath, path.join(path.sep === "\\" ? "C:\\" : "/", "backup", "squad-1"));
    sinon.assert.calledOnce(deps.confirm);
    sinon.assert.calledOnce(deps.backupSquadArtifacts);
    sinon.assert.calledOnceWithExactly(deps.execute, SquadCliCommand.Consult, {
      cwd: WORKSPACE_ROOT,
      args: ["--yes"],
    });
    assert.ok(deps.backupSquadArtifacts.calledBefore(deps.execute));
  });

  test("startConsultMode skips CLI when consult mode is already active", async () => {
    const deps = createService({ configSequence: ['{"consult":true}'] });

    const result = await deps.service.startConsultMode();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.alreadyActive, true);
    assert.ok(deps.confirm.notCalled);
    assert.ok(deps.backupSquadArtifacts.notCalled);
    assert.ok(deps.execute.notCalled);
  });

  test("startConsultMode aborts before backup and CLI when user cancels", async () => {
    const deps = createService({ confirm: false });

    const result = await deps.service.startConsultMode();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cancelled");
    }
    assert.ok(deps.backupSquadArtifacts.notCalled);
    assert.ok(deps.execute.notCalled);
  });

  test("startConsultMode aborts when backup fails", async () => {
    const deps = createService({ backupThrows: new Error("disk full") });

    const result = await deps.service.startConsultMode();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backup-failed");
    }
    assert.ok(deps.execute.notCalled);
  });

  test("extractLearnings requires active consult mode", async () => {
    const deps = createService();

    const result = await deps.service.extractLearnings();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "invalid-input");
      assert.match(result.error.message, /not in Squad consult mode/i);
    }
    assert.ok(deps.execute.notCalled);
  });

  test("extractLearnings confirms, backs up and runs squad extract --yes", async () => {
    const deps = createService({
      configSequence: ['{"consult":true}', '{"consult":true}'],
      executeResult: squadOk({
        command: SquadCliCommand.Extract,
        exitCode: 0,
        stdout: "merged",
        stderr: "",
        durationMs: 3,
      }),
    });

    const result = await deps.service.extractLearnings();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.operation, SquadConsultModeOperation.Extract);
    assert.strictEqual(result.value.stdout, "merged");
    sinon.assert.calledOnceWithExactly(deps.execute, SquadCliCommand.Extract, {
      cwd: WORKSPACE_ROOT,
      args: ["--yes"],
    });
    assert.ok(deps.backupSquadArtifacts.calledBefore(deps.execute));
  });
});
