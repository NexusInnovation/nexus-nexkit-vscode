import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { createHash } from "crypto";
import { SquadFileWriteService, SquadWriteFileSystem } from "../../src/features/squad/services/squadFileWriteService";
import { SquadArtifactBackup } from "../../src/features/squad/services/squadInitService";
import { SQUAD_MAX_READ_BYTES } from "../../src/features/squad/services/squadFileService";
import { isSquadErr, isSquadOk, SquadDocKind } from "../../src/features/squad/models";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

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
  readFile: sinon.SinonStub;
  createDirectory: sinon.SinonStub;
  writeFile: sinon.SinonStub;
}

function createDeps(): WriteDeps {
  const backupSquadArtifacts = sinon.stub().resolves("backup-path");
  const stat = sinon.stub().resolves(fileStat());
  const readFile = sinon.stub().resolves(encode("# Existing\n"));
  const createDirectory = sinon.stub().resolves();
  const writeFile = sinon.stub().resolves();
  return {
    backup: {
      backupSquadArtifacts,
      restoreSquadArtifacts: sinon.stub().resolves(),
    },
    fileSystem: {
      stat,
      readFile,
      createDirectory,
      writeFile,
    },
    backupSquadArtifacts,
    stat,
    readFile,
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
    deps.readFile.rejects({ code: "FileNotFound" });
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
      contentHash: sha256("# Decisions"),
      truncated: false,
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

  suite("saveMarkdownDoc editing guards (SQD-027)", () => {
    test("matching baseContentHash backs up, writes, and returns the new version token", async () => {
      const deps = createDeps();
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Routing, "# Routing\n", {
        baseContentHash: sha256("# Existing\n"),
      });

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.relativePath, ".squad/routing.md");
      assert.strictEqual(result.value.created, false);
      assert.strictEqual(result.value.doc.contentHash, sha256("# Routing\n"));
      assert.strictEqual(result.value.doc.truncated, false);
      assert.ok(deps.readFile.calledBefore(deps.backupSquadArtifacts));
      assert.ok(deps.backupSquadArtifacts.calledBefore(deps.writeFile));
      assert.strictEqual(new TextDecoder().decode(deps.writeFile.firstCall.args[1]), "# Routing\n");
    });

    test("stale baseContentHash returns write-conflict without backup or write", async () => {
      const deps = createDeps();
      deps.readFile.resolves(encode("# Decisions\n- appended by Scribe\n"));
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Decisions, "# Decisions\n- my edit\n", {
        baseContentHash: sha256("# Decisions\n"),
      });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "write-conflict");
      assert.strictEqual(result.error.detail, "modified-on-disk");
      assert.ok(result.error.message.includes(".squad/decisions.md"));
      assert.ok(result.error.remediation);
      assert.ok(deps.backupSquadArtifacts.notCalled);
      assert.ok(deps.writeFile.notCalled);
    });

    test("baseContentHash of a doc deleted on disk returns write-conflict", async () => {
      const deps = createDeps();
      deps.readFile.rejects({ code: "FileNotFound" });
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Routing, "# Routing", {
        baseContentHash: sha256("# Routing"),
      });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "write-conflict");
      assert.strictEqual(result.error.detail, "deleted-on-disk");
      assert.ok(deps.writeFile.notCalled);
    });

    test("null baseContentHash rejects when the doc was created on disk meanwhile", async () => {
      const deps = createDeps();
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Decisions, "# Decisions", { baseContentHash: null });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "write-conflict");
      assert.ok(deps.writeFile.notCalled);
    });

    test("null baseContentHash creates an absent doc", async () => {
      const deps = createDeps();
      deps.stat.rejects({ code: "FileNotFound" });
      deps.readFile.rejects({ code: "FileNotFound" });
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Routing, "# Routing", { baseContentHash: null });

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.created, true);
      assert.ok(deps.backupSquadArtifacts.calledBefore(deps.writeFile));
    });

    test("preserves CRLF line endings of the existing doc", async () => {
      const deps = createDeps();
      deps.readFile.resolves(encode("# Routing\r\n| a | b |\r\n"));
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Routing, "# Routing\n| a | c |\n");

      assert.ok(isSquadOk(result));
      const written = new TextDecoder().decode(deps.writeFile.firstCall.args[1]);
      assert.strictEqual(written, "# Routing\r\n| a | c |\r\n");
      assert.strictEqual(result.value.doc.content, written);
      assert.strictEqual(result.value.doc.contentHash, sha256(written));
    });

    test("keeps LF line endings when the existing doc uses LF", async () => {
      const deps = createDeps();
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Decisions, "# A\n# B\n");

      assert.ok(isSquadOk(result));
      assert.strictEqual(new TextDecoder().decode(deps.writeFile.firstCall.args[1]), "# A\n# B\n");
    });

    test("refuses to overwrite a doc larger than the panel read limit", async () => {
      const deps = createDeps();
      deps.readFile.resolves(new Uint8Array(SQUAD_MAX_READ_BYTES + 1).fill(0x61));
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Decisions, "# truncated edit");

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "file-write-failed");
      assert.ok(result.error.remediation?.includes("editor"));
      assert.ok(deps.backupSquadArtifacts.notCalled);
      assert.ok(deps.writeFile.notCalled);
    });

    test("refuses content larger than the panel read limit", async () => {
      const deps = createDeps();
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Decisions, "x".repeat(SQUAD_MAX_READ_BYTES + 1));

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "file-write-failed");
      assert.ok(deps.backupSquadArtifacts.notCalled);
      assert.ok(deps.writeFile.notCalled);
    });

    test("unsupported doc kind fails before any file access", async () => {
      const deps = createDeps();
      const service = createService(deps);

      const result = await service.saveMarkdownDoc("team" as SquadDocKind, "# Team");

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "file-write-failed");
      assert.strictEqual(result.error.detail, "team");
      assert.ok(deps.readFile.notCalled);
      assert.ok(deps.writeFile.notCalled);
    });

    test("non-string content fails before any file access", async () => {
      const deps = createDeps();
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Routing, undefined as unknown as string);

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "file-write-failed");
      assert.ok(deps.readFile.notCalled);
      assert.ok(deps.writeFile.notCalled);
    });

    test("read failure before save is visible and nothing is written", async () => {
      const deps = createDeps();
      deps.readFile.rejects(new Error("EACCES"));
      const service = createService(deps);

      const result = await service.saveMarkdownDoc(SquadDocKind.Routing, "# Routing");

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "file-write-failed");
      assert.strictEqual(result.error.detail, "EACCES");
      assert.ok(deps.backupSquadArtifacts.notCalled);
      assert.ok(deps.writeFile.notCalled);
    });
  });
});
