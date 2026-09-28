import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SquadFileWriteService, SquadWriteFileSystem } from "../../src/features/squad/services/squadFileWriteService";
import { SquadArtifactBackup } from "../../src/features/squad/services/squadInitService";
import { isSquadErr, isSquadOk, SquadDocKind } from "../../src/features/squad/models";

function fileStat(size = 1): vscode.FileStat {
  return {
    type: vscode.FileType.File,
    ctime: 0,
    mtime: 0,
    size,
  };
}

interface WriteDeps {
  backup: SquadArtifactBackup;
  fileSystem: SquadWriteFileSystem;
  backupSquadArtifacts: sinon.SinonStub;
  stat: sinon.SinonStub;
  createDirectory: sinon.SinonStub;
  writeFile: sinon.SinonStub;
}

function createDeps(): WriteDeps {
  const backupSquadArtifacts = sinon.stub().resolves("backup-path");
  const stat = sinon.stub().resolves(fileStat());
  const createDirectory = sinon.stub().resolves();
  const writeFile = sinon.stub().resolves();
  return {
    backup: {
      backupSquadArtifacts,
      restoreSquadArtifacts: sinon.stub().resolves(),
    },
    fileSystem: {
      stat,
      createDirectory,
      writeFile,
    },
    backupSquadArtifacts,
    stat,
    createDirectory,
    writeFile,
  };
}

const WORKSPACE_ROOT = path.join(path.parse(process.cwd()).root, "workspace");

function createService(deps: WriteDeps, workspaceRoot = WORKSPACE_ROOT): SquadFileWriteService {
  return new SquadFileWriteService(
    vscode.Uri.file(workspaceRoot),
    deps.backup,
    { error: () => undefined } as never,
    deps.fileSystem
  );
}

suite("Unit: SquadFileWriteService (SQD-026 controlled writes)", () => {
  test("saveCharter backs up before writing and returns the updated charter", async () => {
    const deps = createDeps();
    const service = createService(deps);

    const result = await service.saveCharter("link", "# Charter");

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.relativePath, ".squad/agents/link/charter.md");
    assert.strictEqual(result.value.created, false);
    assert.strictEqual(result.value.backupPath, "backup-path");
    assert.strictEqual(result.value.bytesWritten, Buffer.byteLength("# Charter", "utf8"));
    assert.deepStrictEqual(result.value.charter, {
      agentId: "link",
      relativePath: ".squad/agents/link/charter.md",
      content: "# Charter",
    });
    assert.ok(deps.backupSquadArtifacts.calledOnce);
    assert.strictEqual(
      path.normalize(deps.backupSquadArtifacts.firstCall.args[0]).toLowerCase(),
      path.normalize(WORKSPACE_ROOT).toLowerCase()
    );
    assert.ok(deps.backupSquadArtifacts.calledBefore(deps.writeFile));
    assert.ok(deps.createDirectory.calledBefore(deps.writeFile));
    assert.strictEqual(new TextDecoder().decode(deps.writeFile.firstCall.args[1]), "# Charter");
  });

  test("saveMarkdownDoc creates absent governance docs after BackupService is invoked", async () => {
    const deps = createDeps();
    deps.stat.rejects({ code: "FileNotFound" });
    deps.backupSquadArtifacts.resolves(null);
    const service = createService(deps);

    const result = await service.saveMarkdownDoc(SquadDocKind.Decisions, "# Decisions");

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.relativePath, ".squad/decisions.md");
    assert.strictEqual(result.value.created, true);
    assert.strictEqual(result.value.backupPath, null);
    assert.deepStrictEqual(result.value.doc, {
      kind: SquadDocKind.Decisions,
      relativePath: ".squad/decisions.md",
      exists: true,
      content: "# Decisions",
    });
    assert.ok(deps.backupSquadArtifacts.calledOnce);
    assert.ok(deps.writeFile.calledOnce);
  });

  test("invalid charter agent id fails before backup or write", async () => {
    const deps = createDeps();
    const service = createService(deps);

    const result = await service.saveCharter("../secrets", "nope");

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "file-write-failed");
    assert.strictEqual(result.error.detail, "../secrets");
    assert.ok(deps.backupSquadArtifacts.notCalled);
    assert.ok(deps.writeFile.notCalled);
  });

  test("backup failure aborts without writing", async () => {
    const deps = createDeps();
    deps.backupSquadArtifacts.rejects(new Error("disk full"));
    const service = createService(deps);

    const result = await service.saveCharter("link", "# Charter");

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "backup-failed");
    assert.ok(result.error.remediation);
    assert.ok(deps.writeFile.notCalled);
  });

  test("stat permission failure is visible and does not create a success-shaped write", async () => {
    const deps = createDeps();
    deps.stat.rejects(new Error("permission denied"));
    const service = createService(deps);

    const result = await service.saveMarkdownDoc(SquadDocKind.Routing, "# Routing");

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "file-write-failed");
    assert.ok(deps.backupSquadArtifacts.notCalled);
    assert.ok(deps.writeFile.notCalled);
  });
});
