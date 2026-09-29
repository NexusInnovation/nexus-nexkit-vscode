import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import type { LoggingService } from "../../src/shared/services/loggingService";
import { SquadCliCommand, SquadCliService } from "../../src/features/squad/services/squadCliService";
import {
  MAX_SQUAD_IMPORT_BYTES,
  SquadImportBackup,
  SquadImportFileSystem,
  SquadImportPathKind,
  SquadImportService,
} from "../../src/features/squad/services/squadImportService";
import { SquadImportChangeKind, SquadTransferTargetKind, squadErr, squadOk } from "../../src/features/squad/models";

const WORKSPACE_ROOT = vscode.Uri.file(path.join(path.sep === "\\" ? "C:\\" : "/", "ws"));
const ROOT = WORKSPACE_ROOT.fsPath;
const EXPORT_FILE = vscode.Uri.file(path.join(ROOT, "exports", "team-export.json"));
const TEMP_DIR = path.join(ROOT, "..", "tmp-staging");

function silentLogger(): LoggingService {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as unknown as LoggingService;
}

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "1.0",
    exported_at: "2026-09-01T00:00:00.000Z",
    squad_version: "0.9.1",
    casting: { policy: { universe: "The Matrix" }, registry: {} },
    agents: {
      link: { charter: "# Link", history: "## Learnings" },
      morpheus: { charter: "# Morpheus" },
    },
    skills: ["---\nname: Code Review\n---\nbody", "no front matter"],
    ...overrides,
  };
}

/** Minimal in-memory file system keyed by absolute OS path. */
class FakeFileSystem implements SquadImportFileSystem {
  public readonly files = new Map<string, string>();
  public readonly directories = new Set<string>();
  public readonly written = new Map<string, string>();
  public readonly removed: string[] = [];
  public failWrite = false;

  public addFile(absolutePath: string, content: string): void {
    this.files.set(absolutePath, content);
    this._addParents(absolutePath);
  }

  public addDirectory(absolutePath: string): void {
    this.directories.add(absolutePath);
    this._addParents(absolutePath);
  }

  public async readTextFile(absolutePath: string): Promise<string> {
    const content = this.files.get(absolutePath);
    if (content === undefined) {
      throw new Error(`ENOENT: ${absolutePath}`);
    }
    return content;
  }

  public async fileSize(absolutePath: string): Promise<number> {
    return Buffer.byteLength(await this.readTextFile(absolutePath), "utf8");
  }

  public async pathKind(absolutePath: string): Promise<SquadImportPathKind> {
    if (this.files.has(absolutePath)) {
      return "file";
    }
    return this.directories.has(absolutePath) ? "directory" : "missing";
  }

  public async listDirectory(absolutePath: string): Promise<string[]> {
    return [...this.directories].filter((dir) => path.dirname(dir) === absolutePath).map((dir) => path.basename(dir));
  }

  public async makeTempDirectory(): Promise<string> {
    return TEMP_DIR;
  }

  public async writeTextFile(absolutePath: string, content: string): Promise<void> {
    if (this.failWrite) {
      throw new Error("EACCES");
    }
    this.written.set(absolutePath, content);
  }

  public async removePath(absolutePath: string): Promise<void> {
    this.removed.push(absolutePath);
  }

  private _addParents(absolutePath: string): void {
    let parent = path.dirname(absolutePath);
    while (parent !== path.dirname(parent)) {
      this.directories.add(parent);
      parent = path.dirname(parent);
    }
  }
}

interface Harness {
  service: SquadImportService;
  fs: FakeFileSystem;
  execute: sinon.SinonStub;
  confirm: sinon.SinonStub;
  backup: { backupWorkspaceArtifacts: sinon.SinonStub; restoreWorkspaceArtifacts: sinon.SinonStub };
  showOpenDialog: sinon.SinonStub;
  fetchFn: sinon.SinonStub;
  clock: { now: number };
}

function createHarness(overrides: { workspaceRoot?: vscode.Uri | undefined; exportContent?: string } = {}): Harness {
  const fs = new FakeFileSystem();
  fs.addDirectory(ROOT);
  fs.addFile(EXPORT_FILE.fsPath, overrides.exportContent ?? JSON.stringify(manifest()));

  const execute = sinon.stub().resolves(
    squadOk({ command: SquadCliCommand.Import, exitCode: 0, stdout: "imported", stderr: "", durationMs: 42 })
  );
  const confirm = sinon.stub().resolves(true);
  const backup = {
    backupWorkspaceArtifacts: sinon.stub().resolves("backup-dir"),
    restoreWorkspaceArtifacts: sinon.stub().resolves(),
  };
  const showOpenDialog = sinon.stub().resolves([EXPORT_FILE]);
  const fetchFn = sinon.stub();
  const clock = { now: 1_000 };
  let nextId = 0;

  const service = new SquadImportService({
    cli: { execute } as unknown as SquadCliService,
    backup: backup as SquadImportBackup,
    logger: silentLogger(),
    getWorkspaceRoot: () =>
      Object.prototype.hasOwnProperty.call(overrides, "workspaceRoot") ? overrides.workspaceRoot : WORKSPACE_ROOT,
    filePicker: { showOpenDialog },
    confirmer: { confirm },
    fileSystem: fs,
    fetchFn,
    getGitHubHeaders: async () => ({ "User-Agent": "Nexkit-Test" }),
    now: () => clock.now,
    createId: () => `preview-${++nextId}`,
    previewTtlMs: 60_000,
  });

  return { service, fs, execute, confirm, backup, showOpenDialog, fetchFn, clock };
}

function fileSource(): { kind: typeof SquadTransferTargetKind.File; uri: string } {
  return { kind: SquadTransferTargetKind.File, uri: EXPORT_FILE.toString() };
}

suite("Unit: SquadImportService (SQD-034 import with preview and backup)", () => {
  suite("previewImport", () => {
    test("previews a new Squad from a picked file without writing anything", async () => {
      const h = createHarness();

      const result = await h.service.previewImport();

      assert.strictEqual(result.ok, true);
      if (!result.ok) {
        return;
      }
      const preview = result.value;
      assert.ok(h.showOpenDialog.calledOnce);
      assert.strictEqual(preview.previewId, "preview-1");
      assert.strictEqual(preview.sourceLabel, "team-export.json");
      assert.strictEqual(preview.manifestVersion, "1.0");
      assert.strictEqual(preview.squadVersion, "0.9.1");
      assert.strictEqual(preview.exportedAt, "2026-09-01T00:00:00.000Z");
      assert.strictEqual(preview.universe, "The Matrix");
      assert.strictEqual(preview.squadDirectory, ".squad");
      assert.strictEqual(preview.hasExistingSquad, false);
      assert.deepStrictEqual(
        preview.agents.map((agent) => [agent.name, agent.hasCharter, agent.hasHistory, agent.change]),
        [
          ["link", true, true, SquadImportChangeKind.Create],
          ["morpheus", true, false, SquadImportChangeKind.Create],
        ]
      );
      assert.deepStrictEqual(
        preview.skills.map((skill) => skill.name),
        ["code-review", "skill-1"]
      );
      assert.deepStrictEqual(preview.castingKeys, ["policy", "registry"]);
      assert.deepStrictEqual(
        preview.files.map((file) => file.relativePath),
        [
          ".squad/decisions.md",
          ".squad/team.md",
          ".squad/casting/policy.json",
          ".squad/casting/registry.json",
          ".squad/agents/link/charter.md",
          ".squad/agents/link/history.md",
          ".squad/agents/morpheus/charter.md",
          ".squad/agents/morpheus/history.md",
          ".copilot/skills/code-review/SKILL.md",
          ".copilot/skills/skill-1/SKILL.md",
        ]
      );
      assert.ok(preview.files.every((file) => file.change === SquadImportChangeKind.Create));
      assert.ok(preview.warnings.some((warning) => warning.includes("histories")));
      assert.ok(h.execute.notCalled);
      assert.ok(h.backup.backupWorkspaceArtifacts.notCalled);
      assert.ok(h.confirm.notCalled);
      assert.strictEqual(h.fs.written.size, 0);
    });

    test("flags overwrites, dropped agents and replaced skills for an existing Squad", async () => {
      const h = createHarness();
      h.fs.addFile(path.join(ROOT, ".squad", "team.md"), "team");
      h.fs.addFile(path.join(ROOT, ".squad", "agents", "link", "history.md"), "h");
      h.fs.addDirectory(path.join(ROOT, ".squad", "agents", "trinity"));
      h.fs.addFile(path.join(ROOT, ".copilot", "skills", "code-review", "SKILL.md"), "old");

      const result = await h.service.previewImport({ source: fileSource() });

      assert.strictEqual(result.ok, true);
      if (!result.ok) {
        return;
      }
      const preview = result.value;
      assert.ok(h.showOpenDialog.notCalled);
      assert.strictEqual(preview.hasExistingSquad, true);
      const change = (relativePath: string): string | undefined =>
        preview.files.find((file) => file.relativePath === relativePath)?.change;
      assert.strictEqual(change(".squad/team.md"), SquadImportChangeKind.Overwrite);
      assert.strictEqual(change(".squad/decisions.md"), SquadImportChangeKind.Create);
      assert.strictEqual(change(".squad/agents/link/history.md"), SquadImportChangeKind.Overwrite);
      assert.strictEqual(preview.agents.find((agent) => agent.name === "link")?.change, SquadImportChangeKind.Overwrite);
      assert.strictEqual(preview.skills[0].change, SquadImportChangeKind.Overwrite);
      assert.ok(preview.warnings.some((warning) => warning.includes("archived")));
      assert.ok(preview.warnings.some((warning) => warning.includes("trinity")));
      assert.ok(preview.warnings.some((warning) => warning.includes("code-review")));
    });

    test("targets the legacy .ai-team directory when only it exists", async () => {
      const h = createHarness();
      h.fs.addFile(path.join(ROOT, ".ai-team", "team.md"), "team");

      const result = await h.service.previewImport({ source: fileSource() });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.squadDirectory, ".ai-team");
        assert.ok(result.value.files.some((file) => file.relativePath === ".ai-team/team.md"));
      }
    });

    test("returns not-a-workspace without prompting", async () => {
      const h = createHarness({ workspaceRoot: undefined });

      const result = await h.service.previewImport();

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "not-a-workspace");
        assert.ok(result.error.remediation);
      }
      assert.ok(h.showOpenDialog.notCalled);
    });

    test("returns cancelled when the file picker is dismissed", async () => {
      const h = createHarness();
      h.showOpenDialog.resolves(undefined);

      const result = await h.service.previewImport();

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cancelled");
        assert.ok(result.error.remediation);
      }
    });

    test("rejects non-local file URIs", async () => {
      const h = createHarness();

      const result = await h.service.previewImport({
        source: { kind: SquadTransferTargetKind.File, uri: "https://example.com/squad-export.json" },
      });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "file-read-failed");
        assert.ok(result.error.remediation);
      }
    });

    test("reports unreadable files as actionable errors", async () => {
      const h = createHarness();
      h.fs.files.delete(EXPORT_FILE.fsPath);

      const result = await h.service.previewImport({ source: fileSource() });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "file-read-failed");
        assert.ok(result.error.remediation);
      }
    });

    test("rejects exports larger than the preview limit", async () => {
      const h = createHarness({ exportContent: "x".repeat(MAX_SQUAD_IMPORT_BYTES + 1) });

      const result = await h.service.previewImport({ source: fileSource() });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "parse-failed");
      }
    });

    const invalidManifests: [string, string][] = [
      ["invalid JSON", "{not json"],
      ["a non-object", "[]"],
      ["an unsupported version", JSON.stringify(manifest({ version: "2.0" }))],
      ["missing agents", JSON.stringify(manifest({ agents: undefined }))],
      ["missing casting", JSON.stringify(manifest({ casting: [] }))],
      ["non-text skills", JSON.stringify(manifest({ skills: [1] }))],
      ["an unsafe agent name", JSON.stringify(manifest({ agents: { "../evil": { charter: "x" } } }))],
      ["a non-text charter", JSON.stringify(manifest({ agents: { link: { charter: 5 } } }))],
      ["an unsafe casting key", JSON.stringify(manifest({ casting: { "..\\x": {} } }))],
      ["a non-text team field", JSON.stringify(manifest({ team_md: 3 }))],
    ];
    for (const [label, content] of invalidManifests) {
      test(`rejects ${label} with parse-failed and stages nothing`, async () => {
        const h = createHarness({ exportContent: content });

        const result = await h.service.previewImport({ source: fileSource() });

        assert.strictEqual(result.ok, false);
        if (!result.ok) {
          assert.strictEqual(result.error.code, "parse-failed");
          assert.ok(result.error.remediation);
        }
        const apply = await h.service.applyImport({ previewId: "preview-1" });
        assert.strictEqual(apply.ok, false);
        assert.ok(h.execute.notCalled);
      });
    }

    test("refuses a git worktree without its own Squad", async () => {
      const h = createHarness();
      h.fs.addFile(path.join(ROOT, ".git"), "gitdir: ../main/.git/worktrees/ws");

      const result = await h.service.previewImport({ source: fileSource() });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "file-write-failed");
        assert.ok(result.error.remediation);
      }
    });

    test("downloads GitHub sources via the contents API with auth headers", async () => {
      const h = createHarness();
      h.fetchFn.resolves({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(manifest()),
      });

      const result = await h.service.previewImport({
        source: { kind: SquadTransferTargetKind.GitHub, repository: " Nexus/team ", ref: "main", path: "exports/squad.json" },
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.sourceLabel, "Nexus/team");
        assert.deepStrictEqual(result.value.source, {
          kind: SquadTransferTargetKind.GitHub,
          repository: "Nexus/team",
          path: "exports/squad.json",
          ref: "main",
        });
      }
      const [url, init] = h.fetchFn.firstCall.args;
      assert.strictEqual(url, "https://api.github.com/repos/Nexus/team/contents/exports/squad.json?ref=main");
      assert.strictEqual(init.headers["User-Agent"], "Nexkit-Test");
      assert.strictEqual(init.headers.Accept, "application/vnd.github.raw+json");
    });

    test("maps GitHub 404 and rate limits to actionable errors", async () => {
      const h = createHarness();
      const source = { kind: SquadTransferTargetKind.GitHub, repository: "Nexus/team" } as const;
      h.fetchFn.resolves({ ok: false, status: 404, headers: { get: () => null }, text: async () => "" });

      const notFound = await h.service.previewImport({ source });
      assert.strictEqual(notFound.ok, false);
      if (!notFound.ok) {
        assert.strictEqual(notFound.error.code, "file-read-failed");
        assert.ok(notFound.error.message.includes("squad-export.json"));
        assert.ok(notFound.error.remediation);
      }

      h.fetchFn.resolves({ ok: false, status: 403, headers: { get: () => "0" }, text: async () => "" });
      const limited = await h.service.previewImport({ source });
      assert.strictEqual(limited.ok, false);
      if (!limited.ok) {
        assert.ok(limited.error.message.includes("rate limit"));
      }
    });

    test("rejects malformed GitHub repositories and paths before fetching", async () => {
      const h = createHarness();

      const badRepo = await h.service.previewImport({
        source: { kind: SquadTransferTargetKind.GitHub, repository: "not-a-repo" },
      });
      const badPath = await h.service.previewImport({
        source: { kind: SquadTransferTargetKind.GitHub, repository: "Nexus/team", path: "../secrets.json" },
      });

      assert.strictEqual(badRepo.ok, false);
      assert.strictEqual(badPath.ok, false);
      assert.ok(h.fetchFn.notCalled);
    });
  });

  suite("applyImport", () => {
    test("confirms, backs up, then runs `squad import <staged> --force` with the previewed content", async () => {
      const h = createHarness();
      const preview = await h.service.previewImport({ source: fileSource() });
      assert.ok(preview.ok);
      if (!preview.ok) {
        return;
      }
      const previewed = h.fs.files.get(EXPORT_FILE.fsPath);
      h.fs.addFile(EXPORT_FILE.fsPath, "changed on disk after preview");

      const result = await h.service.applyImport({ previewId: preview.value.previewId });

      assert.strictEqual(result.ok, true);
      if (!result.ok) {
        return;
      }
      assert.deepStrictEqual(result.value, {
        previewId: "preview-1",
        source: preview.value.source,
        importedAt: 1_000,
        agentCount: 2,
        skillCount: 2,
        backupCreated: true,
        stdout: "imported",
        stderr: "",
        durationMs: 42,
      });

      sinon.assert.callOrder(h.confirm, h.backup.backupWorkspaceArtifacts, h.execute);
      assert.ok(h.confirm.calledOnceWithExactly(preview.value));
      assert.deepStrictEqual(h.backup.backupWorkspaceArtifacts.firstCall.args, [
        ROOT,
        [".squad", path.join(".copilot", "skills", "code-review"), path.join(".copilot", "skills", "skill-1")],
        "squad-import",
      ]);
      const stagedFile = path.join(TEMP_DIR, "team-export.json");
      assert.strictEqual(h.fs.written.get(stagedFile), previewed);
      assert.ok(h.execute.calledOnceWithExactly(SquadCliCommand.Import, { cwd: WORKSPACE_ROOT, args: [stagedFile, "--force"] }));
      assert.deepStrictEqual(h.fs.removed, [TEMP_DIR]);

      const again = await h.service.applyImport({ previewId: "preview-1" });
      assert.strictEqual(again.ok, false);
      if (!again.ok) {
        assert.strictEqual(again.error.code, "cancelled");
      }
    });

    test("reports backupCreated=false when there was nothing to back up", async () => {
      const h = createHarness();
      h.backup.backupWorkspaceArtifacts.resolves(null);
      const preview = await h.service.previewImport({ source: fileSource() });
      assert.ok(preview.ok);

      const result = await h.service.applyImport({ previewId: "preview-1" });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.backupCreated, false);
      }
    });

    test("does nothing when the user declines the confirmation", async () => {
      const h = createHarness();
      h.confirm.resolves(false);
      await h.service.previewImport({ source: fileSource() });

      const result = await h.service.applyImport({ previewId: "preview-1" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cancelled");
        assert.ok(result.error.remediation);
      }
      assert.ok(h.backup.backupWorkspaceArtifacts.notCalled);
      assert.ok(h.execute.notCalled);
    });

    test("aborts before any write when the backup fails", async () => {
      const h = createHarness();
      h.backup.backupWorkspaceArtifacts.rejects(new Error("ENOSPC"));
      await h.service.previewImport({ source: fileSource() });

      const result = await h.service.applyImport({ previewId: "preview-1" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "backup-failed");
        assert.strictEqual(result.error.detail, "ENOSPC");
        assert.ok(result.error.remediation);
      }
      assert.ok(h.execute.notCalled);
      assert.strictEqual(h.fs.written.size, 0);
    });

    test("returns file-write-failed when the export cannot be staged", async () => {
      const h = createHarness();
      h.fs.failWrite = true;
      await h.service.previewImport({ source: fileSource() });

      const result = await h.service.applyImport({ previewId: "preview-1" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "file-write-failed");
        assert.ok(result.error.remediation);
      }
      assert.ok(h.execute.notCalled);
      assert.deepStrictEqual(h.fs.removed, [TEMP_DIR]);
    });

    test("rolls back from the backup and surfaces the CLI failure", async () => {
      const h = createHarness();
      h.execute.resolves(squadErr({ code: "cli-execution-failed", message: "boom", remediation: "check the CLI" }));
      await h.service.previewImport({ source: fileSource() });

      const result = await h.service.applyImport({ previewId: "preview-1" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-execution-failed");
        assert.ok(result.error.message.startsWith("Squad import failed."));
        assert.ok(result.error.remediation?.includes("check the CLI"));
        assert.ok(result.error.remediation?.includes("restored"));
      }
      assert.ok(
        h.backup.restoreWorkspaceArtifacts.calledOnceWithExactly(ROOT, "backup-dir", h.backup.backupWorkspaceArtifacts.firstCall.args[1])
      );
      assert.deepStrictEqual(h.fs.removed, [TEMP_DIR]);
    });

    test("removes partially imported paths when there was no backup and the CLI fails", async () => {
      const h = createHarness();
      h.backup.backupWorkspaceArtifacts.resolves(null);
      h.execute.resolves(squadErr({ code: "cli-timeout", message: "timed out" }));
      await h.service.previewImport({ source: fileSource() });

      const result = await h.service.applyImport({ previewId: "preview-1" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.remediation?.includes("partially imported files were removed"));
      }
      assert.ok(h.backup.restoreWorkspaceArtifacts.notCalled);
      assert.ok(h.fs.removed.includes(path.join(ROOT, ".squad")));
    });

    test("tells the user where to restore from when rollback fails", async () => {
      const h = createHarness();
      h.execute.resolves(squadErr({ code: "cli-execution-failed", message: "boom" }));
      h.backup.restoreWorkspaceArtifacts.rejects(new Error("EPERM"));
      await h.service.previewImport({ source: fileSource() });

      const result = await h.service.applyImport({ previewId: "preview-1" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.remediation?.includes("squad-import-"));
      }
    });

    test("rejects unknown, discarded and expired previews", async () => {
      const h = createHarness();

      const unknown = await h.service.applyImport({ previewId: "nope" });
      assert.strictEqual(unknown.ok, false);

      await h.service.previewImport({ source: fileSource() });
      h.service.discardPreview();
      const discarded = await h.service.applyImport({ previewId: "preview-1" });
      assert.strictEqual(discarded.ok, false);

      await h.service.previewImport({ source: fileSource() });
      h.clock.now += 60_001;
      const expired = await h.service.applyImport({ previewId: "preview-2" });
      assert.strictEqual(expired.ok, false);
      if (!expired.ok) {
        assert.strictEqual(expired.error.code, "cancelled");
        assert.ok(expired.error.message.includes("expired"));
      }

      assert.ok(h.confirm.notCalled);
      assert.ok(h.execute.notCalled);
    });

    test("refuses to apply when the workspace changed since the preview", async () => {
      const h = createHarness();
      await h.service.previewImport({ source: fileSource() });
      h.fs.addFile(path.join(ROOT, ".squad", "team.md"), "created meanwhile");

      const result = await h.service.applyImport({ previewId: "preview-1" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "file-write-failed");
        assert.ok(result.error.remediation);
      }
      assert.ok(h.confirm.notCalled);
      assert.ok(h.backup.backupWorkspaceArtifacts.notCalled);
    });

    test("returns not-a-workspace when the workspace closed after the preview", async () => {
      const h = createHarness({ workspaceRoot: undefined });

      const result = await h.service.applyImport({ previewId: "preview-1" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "not-a-workspace");
      }
    });
  });
});
