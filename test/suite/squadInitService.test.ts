import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import {
  SquadArtifactBackup,
  SquadInitConfirmer,
  SquadInitFileSystem,
  SquadInitService,
} from "../../src/features/squad/services/squadInitService";
import { SquadCliService } from "../../src/features/squad/services/squadCliService";
import { SquadDetectionService } from "../../src/features/squad/services/squadDetectionService";
import { SquadPresetDownloadService } from "../../src/features/squad/services/squadPresetDownloadService";
import {
  SquadPreset,
  SquadPresetProvider,
  SquadPresetSourceKind,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

const WORKSPACE_ROOT = path.join(path.sep === "\\" ? "C:\\" : "/", "ws");

function makePreset(id: string): SquadPreset {
  return {
    id,
    name: `Preset ${id}`,
    description: `Description ${id}`,
    source: {
      kind: SquadPresetSourceKind.Marketplace,
      pluginId: id,
      repository: "NexusInnovation/nexus-plugin-marketplace",
      squadFolderPath: `plugins/${id}/squad`,
    },
  };
}

function makeFiles(entries: [string, string][]): Map<string, string> {
  return new Map(entries);
}

interface FakeFs extends SquadInitFileSystem {
  written: Map<string, string>;
  removed: string[];
  existing: Set<string>;
}

function createFakeFs(existing: string[] = []): FakeFs {
  const written = new Map<string, string>();
  const removed: string[] = [];
  const existingSet = new Set(existing);
  return {
    written,
    removed,
    existing: existingSet,
    async exists(p: string): Promise<boolean> {
      return existingSet.has(p);
    },
    async writeFile(p: string, content: string): Promise<void> {
      written.set(p, content);
    },
    async removePath(p: string): Promise<void> {
      removed.push(p);
    },
  };
}

interface Deps {
  presetProvider: SquadPresetProvider;
  downloadService: SquadPresetDownloadService;
  cli: SquadCliService;
  backup: SquadArtifactBackup;
  detection: SquadDetectionService;
  confirmer: SquadInitConfirmer;
  fileSystem: FakeFs;
  discover: sinon.SinonStub;
  download: sinon.SinonStub;
  execute: sinon.SinonStub;
  backupSquad: sinon.SinonStub;
  restoreSquad: sinon.SinonStub;
  detect: sinon.SinonStub;
  confirm: sinon.SinonStub;
}

function createDeps(overrides: Partial<{
  presets: SquadPreset[];
  files: Map<string, string>;
  downloadResult: unknown;
  discoverResult: unknown;
  executeResult: unknown;
  backupPath: string | null;
  backupThrows: Error;
  detectResult: unknown;
  confirm: boolean;
  fileSystem: FakeFs;
}> = {}): Deps {
  const presets = overrides.presets ?? [makePreset("alpha")];
  const files = overrides.files ?? makeFiles([
    ["manifest.json", "{}"],
    ["team.md", "# Team"],
    ["agents/link/charter.md", "# Charter"],
  ]);

  const discover = sinon.stub().resolves(
    overrides.discoverResult ?? squadOk({ presets, rejected: [] })
  );
  const download = sinon.stub().resolves(
    overrides.downloadResult ?? squadOk({ preset: presets[0], files, validation: { valid: true, diagnostics: [] } })
  );
  const execute = sinon.stub().resolves(
    overrides.executeResult ?? squadOk({ command: "init", exitCode: 0, stdout: "", stderr: "", durationMs: 1 })
  );
  const backupSquad = sinon.stub();
  if (overrides.backupThrows) {
    backupSquad.rejects(overrides.backupThrows);
  } else {
    backupSquad.resolves(overrides.backupPath ?? null);
  }
  const restoreSquad = sinon.stub().resolves();
  const detect = sinon.stub().resolves(
    overrides.detectResult ?? squadOk({ installed: true } as never)
  );
  const confirm = sinon.stub().resolves(overrides.confirm ?? true);

  return {
    presetProvider: { id: "composite", label: "All", discoverPresets: discover } as unknown as SquadPresetProvider,
    downloadService: { downloadPreset: download } as unknown as SquadPresetDownloadService,
    cli: { execute } as unknown as SquadCliService,
    backup: { backupSquadArtifacts: backupSquad, restoreSquadArtifacts: restoreSquad },
    detection: { detect } as unknown as SquadDetectionService,
    confirmer: { confirm },
    fileSystem: overrides.fileSystem ?? createFakeFs(),
    discover,
    download,
    execute,
    backupSquad,
    restoreSquad,
    detect,
    confirm,
  };
}

function createService(deps: Deps): SquadInitService {
  return new SquadInitService({
    presetProvider: deps.presetProvider,
    downloadService: deps.downloadService,
    cli: deps.cli,
    backup: deps.backup,
    detection: deps.detection,
    confirmer: deps.confirmer,
    fileSystem: deps.fileSystem,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    } as never,
    getWorkspaceRoot: () => WORKSPACE_ROOT,
  });
}

suite("Unit: SquadInitService (SQD-020 init from preset)", () => {
  test("happy path: confirms, backs up, runs init, writes files, re-detects", async () => {
    const deps = createDeps({ backupPath: "/backups/squad-1" });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presetId, "alpha");
    assert.strictEqual(result.value.writtenFileCount, 3);
    assert.strictEqual(result.value.backupPath, "/backups/squad-1");
    assert.ok(result.value.detection);

    // Ordering guarantees: backup before any write, init before writes.
    assert.ok(deps.confirm.calledOnce);
    assert.ok(deps.backupSquad.calledOnce);
    assert.ok(deps.execute.calledOnce);
    assert.ok(deps.backupSquad.calledBefore(deps.execute));
    assert.strictEqual(deps.fileSystem.written.size, 3);
    // Files are written under .squad/
    const squadDir = path.join(WORKSPACE_ROOT, ".squad");
    assert.ok(deps.fileSystem.written.has(path.join(squadDir, "team.md")));
    assert.ok(deps.fileSystem.written.has(path.join(squadDir, "agents", "link", "charter.md")));
    // No rollback on success.
    assert.strictEqual(deps.restoreSquad.called, false);
  });

  test("no open workspace returns not-a-workspace", async () => {
    const deps = createDeps();
    const service = new SquadInitService({
      presetProvider: deps.presetProvider,
      downloadService: deps.downloadService,
      cli: deps.cli,
      backup: deps.backup,
      detection: deps.detection,
      confirmer: deps.confirmer,
      fileSystem: deps.fileSystem,
      getWorkspaceRoot: () => undefined,
    });

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "not-a-workspace");
    assert.ok(deps.backupSquad.notCalled);
  });

  test("user cancels: no backup, no init, no writes", async () => {
    const deps = createDeps({ confirm: false });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "cancelled");
    assert.ok(result.error.remediation);
    assert.ok(deps.backupSquad.notCalled);
    assert.ok(deps.execute.notCalled);
    assert.strictEqual(deps.fileSystem.written.size, 0);
  });

  test("preset not found in discovery returns preset-invalid", async () => {
    const deps = createDeps({ presets: [makePreset("beta")] });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "preset-invalid");
    assert.ok(deps.download.notCalled);
    assert.ok(deps.confirm.notCalled);
  });

  test("preset re-validation failure aborts before confirm/backup", async () => {
    const deps = createDeps({
      downloadResult: squadErr({ code: "preset-invalid", message: "team.md missing", remediation: "Add team.md." }),
    });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "preset-invalid");
    assert.ok(deps.confirm.notCalled);
    assert.ok(deps.backupSquad.notCalled);
  });

  test("path traversal in preset files is rejected before confirm/backup", async () => {
    const deps = createDeps({
      files: makeFiles([
        ["manifest.json", "{}"],
        ["../evil.md", "pwned"],
      ]),
    });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "preset-invalid");
    assert.ok(/outside/i.test(result.error.message));
    assert.ok(deps.confirm.notCalled);
    assert.ok(deps.backupSquad.notCalled);
    assert.strictEqual(deps.fileSystem.written.size, 0);
  });

  test("backup failure aborts before any init or write", async () => {
    const deps = createDeps({ backupThrows: new Error("disk full") });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "backup-failed");
    assert.strictEqual(result.error.detail, "disk full");
    assert.ok(deps.execute.notCalled);
    assert.strictEqual(deps.fileSystem.written.size, 0);
    assert.ok(deps.restoreSquad.notCalled);
  });

  test("CLI init failure rolls back and returns the CLI error", async () => {
    const deps = createDeps({
      backupPath: "/backups/squad-2",
      executeResult: squadErr({ code: "cli-not-found", message: "The Squad CLI could not be found.", remediation: "Install it." }),
    });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "cli-not-found");
    // No preset files were written; backup restored on rollback.
    assert.strictEqual(deps.fileSystem.written.size, 0);
    assert.ok(deps.restoreSquad.calledOnceWithExactly(WORKSPACE_ROOT, "/backups/squad-2"));
  });

  test("partial write failure rolls back written files and restores backup", async () => {
    const fileSystem = createFakeFs();
    let calls = 0;
    fileSystem.writeFile = async (p: string, content: string): Promise<void> => {
      calls += 1;
      if (calls === 2) {
        throw new Error("EACCES");
      }
      fileSystem.written.set(p, content);
    };
    const deps = createDeps({ backupPath: "/backups/squad-3", fileSystem });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "file-write-failed");
    assert.strictEqual(result.error.detail, "EACCES");
    // The one successfully-written file was removed during rollback...
    assert.strictEqual(fileSystem.removed.length, 1);
    // ...and the pre-existing backup was restored.
    assert.ok(deps.restoreSquad.calledOnceWithExactly(WORKSPACE_ROOT, "/backups/squad-3"));
  });

  test("fresh init (no backup) rolls back by removing created artifacts", async () => {
    const fileSystem = createFakeFs();
    fileSystem.writeFile = async (): Promise<void> => {
      throw new Error("boom");
    };
    const deps = createDeps({ backupPath: null, fileSystem });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    // No backup to restore; .squad and squad.agent.md are removed instead.
    assert.ok(deps.restoreSquad.notCalled);
    assert.ok(fileSystem.removed.includes(path.join(WORKSPACE_ROOT, ".squad")));
    assert.ok(
      fileSystem.removed.includes(path.join(WORKSPACE_ROOT, ".github", "agents", "squad.agent.md"))
    );
  });

  test("confirmation request reports existing Squad and preset file count", async () => {
    const fileSystem = createFakeFs([path.join(WORKSPACE_ROOT, ".squad")]);
    const deps = createDeps({ fileSystem });
    const service = createService(deps);

    await service.initializeFromPreset("alpha");

    assert.ok(deps.confirm.calledOnce);
    const request = deps.confirm.firstCall.args[0];
    assert.strictEqual(request.hasExistingSquad, true);
    assert.strictEqual(request.fileCount, 3);
    assert.strictEqual(request.willRunCli, true);
    assert.ok(request.filePaths.includes("team.md"));
  });

  test("discovery source-level failure is surfaced", async () => {
    const deps = createDeps({
      discoverResult: squadErr({ code: "not-a-workspace", message: "Marketplace not installed", remediation: "Install it." }),
    });
    const service = createService(deps);

    const result = await service.initializeFromPreset("alpha");

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.error.code, "not-a-workspace");
    assert.ok(deps.confirm.notCalled);
  });
});
