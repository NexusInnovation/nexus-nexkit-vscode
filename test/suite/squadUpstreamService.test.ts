/**
 * Tests for SquadUpstreamService (SQD-036 / #251, FR-031/FR-032).
 *
 * The Squad CLI, manifest reader, backup and confirmation seams are all faked:
 * no process is spawned and no file is written.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  SquadUpstreamKind,
  SquadUpstreamOperation,
  isSquadErr,
  isSquadOk,
  squadErr,
  squadOk,
  type SquadResult,
  type SquadUpstreamSource,
} from "../../src/features/squad/models";
import { SquadCliCommand, type SquadCliExecution } from "../../src/features/squad/services/squadCliService";
import { SQUAD_UPSTREAM_TIMEOUTS_MS, SquadUpstreamService } from "../../src/features/squad/services/squadUpstreamService";

const ROOT = vscode.Uri.file("/tmp/workspace");

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

function upstream(id: string, kind: SquadUpstreamSource["kind"] = SquadUpstreamKind.Git): SquadUpstreamSource {
  return { id, kind, reference: `https://github.com/org/${id}.git` };
}

function cliOk(stdout: string, stderr = ""): SquadResult<SquadCliExecution> {
  return squadOk({ command: SquadCliCommand.Upstream, exitCode: 0, stdout, stderr, durationMs: 5 });
}

interface Harness {
  service: SquadUpstreamService;
  execute: sinon.SinonStub;
  readUpstreams: sinon.SinonStub;
  backup: sinon.SinonStub;
  restore: sinon.SinonStub;
  confirmRemove: sinon.SinonStub;
}

function createHarness(manifest: SquadUpstreamSource[][] = [[]]): Harness {
  const execute = sinon.stub().resolves(cliOk(""));
  const readUpstreams = sinon.stub();
  manifest.forEach((list, index) => readUpstreams.onCall(index).resolves(squadOk(list)));
  readUpstreams.resolves(squadOk(manifest[manifest.length - 1]));
  const backup = sinon.stub().resolves("/backups/squad-upstream-1");
  const restore = sinon.stub().resolves();
  const confirmRemove = sinon.stub().resolves(true);

  const service = new SquadUpstreamService({
    cli: { execute },
    backup: { backupSquadUpstreamManifest: backup, restoreSquadUpstreamManifest: restore },
    confirmer: { confirmRemove },
    createReader: () => ({ readUpstreams }),
    logger: silentLogger,
  });
  return { service, execute, readUpstreams, backup, restore, confirmRemove };
}

suite("Unit: SquadUpstreamService", () => {
  suite("list (FR-032)", () => {
    test("runs `squad upstream list` in the workspace and returns the manifest", async () => {
      const h = createHarness([[upstream("org")]]);
      h.execute.resolves(cliOk("\nConfigured upstreams:\n\n  org  →  git: https://github.com/org/org.git\n"));

      const result = await h.service.list(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.operation, SquadUpstreamOperation.List);
      assert.deepStrictEqual(
        result.value.upstreams.map((u) => u.id),
        ["org"]
      );
      sinon.assert.calledOnce(h.execute);
      const [command, options] = h.execute.firstCall.args;
      assert.strictEqual(command, SquadCliCommand.Upstream);
      assert.deepStrictEqual(options.args, ["list"]);
      assert.strictEqual(options.cwd, ROOT);
      assert.strictEqual(options.timeoutMs, SQUAD_UPSTREAM_TIMEOUTS_MS.list);
      sinon.assert.notCalled(h.backup);
    });

    test("surfaces a missing CLI as an actionable error", async () => {
      const h = createHarness();
      h.execute.resolves(
        squadErr({ code: "cli-not-found", message: "The Squad CLI could not be found.", remediation: "Install it." })
      );

      const result = await h.service.list(ROOT);

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "cli-not-found");
      assert.ok(result.error.remediation);
    });

    test("fails with not-a-workspace when no folder is open", async () => {
      const h = createHarness();
      const result = await h.service.list(undefined);
      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "not-a-workspace");
      sinon.assert.notCalled(h.execute);
    });
  });

  suite("add (FR-031)", () => {
    test("backs up the manifest, then runs `upstream add <source> --name --ref`", async () => {
      const h = createHarness([[], [upstream("org")]]);
      h.execute.resolves(cliOk("✓ Cloned upstream repo\n✓ Added upstream: org (git: https://github.com/org/org.git)"));

      const result = await h.service.add(ROOT, { source: " https://github.com/org/org.git ", name: "org", ref: "release/1.0" });

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.name, "org");
      assert.strictEqual(result.value.backupPath, "/backups/squad-upstream-1");
      assert.deepStrictEqual(
        result.value.upstreams.map((u) => u.id),
        ["org"]
      );
      assert.deepStrictEqual(h.execute.firstCall.args[1].args, [
        "add",
        "https://github.com/org/org.git",
        "--name",
        "org",
        "--ref",
        "release/1.0",
      ]);
      assert.strictEqual(h.execute.firstCall.args[1].timeoutMs, SQUAD_UPSTREAM_TIMEOUTS_MS.add);
      sinon.assert.calledWith(h.backup, ROOT.fsPath);
      assert.ok(h.backup.calledBefore(h.execute), "backup must happen before the CLI writes");
    });

    test("supports local and export sources without name or ref, resolving the CLI-derived name", async () => {
      const h = createHarness([[], [upstream("team", SquadUpstreamKind.Local)]]);
      h.execute.resolves(cliOk("\u001b[32m✓\u001b[0m Added upstream: team (local: C:\\repos\\team)"));

      const result = await h.service.add(ROOT, { source: "../team" });

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.name, "team");
      assert.deepStrictEqual(h.execute.firstCall.args[1].args, ["add", "../team"]);
    });

    for (const [label, request] of [
      ["an empty source", { source: "   " }],
      ["a source starting with '-'", { source: "--upload-pack=evil" }],
      ["a source with shell metacharacters", { source: "repo&calc" }],
      ["a source with a newline", { source: "repo\nrm" }],
      ["an invalid name", { source: "../team", name: "bad name" }],
      ["a name starting with '-'", { source: "../team", name: "-x" }],
      ["an invalid git ref", { source: "org/repo", ref: "main;rm" }],
    ] as const) {
      test(`rejects ${label} before spawning or backing up`, async () => {
        const h = createHarness();
        const result = await h.service.add(ROOT, request);
        assert.ok(isSquadErr(result));
        assert.strictEqual(result.error.code, "invalid-input");
        assert.ok(result.error.remediation);
        sinon.assert.notCalled(h.execute);
        sinon.assert.notCalled(h.backup);
      });
    }

    test("rejects a duplicate name without calling the CLI", async () => {
      const h = createHarness([[upstream("org")]]);
      const result = await h.service.add(ROOT, { source: "org/other", name: "org" });
      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "invalid-input");
      sinon.assert.notCalled(h.execute);
    });

    test("aborts when the current manifest is unreadable (the CLI would clobber it)", async () => {
      const h = createHarness();
      h.readUpstreams.onFirstCall().resolves(squadErr({ code: "parse-failed", message: "bad json", remediation: "Fix it." }));

      const result = await h.service.add(ROOT, { source: "../team" });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "parse-failed");
      assert.ok(result.error.remediation?.includes("Nothing was changed"));
      sinon.assert.notCalled(h.execute);
    });

    test("aborts with backup-failed before any write when the backup throws", async () => {
      const h = createHarness();
      h.backup.rejects(new Error("disk full"));

      const result = await h.service.add(ROOT, { source: "../team" });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "backup-failed");
      sinon.assert.notCalled(h.execute);
    });

    test("restores the backup and contextualizes the error when the CLI fails", async () => {
      const h = createHarness();
      h.execute.resolves(
        squadErr({
          code: "cli-execution-failed",
          message: 'The Squad "upstream" command failed: Cannot determine source type for "nope".',
          detail: "exitCode=1",
        })
      );

      const result = await h.service.add(ROOT, { source: "nope" });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "cli-execution-failed");
      assert.ok(result.error.message.startsWith("Adding the Squad upstream failed."));
      assert.ok(result.error.message.includes("Cannot determine source type"));
      assert.ok(result.error.remediation);
      sinon.assert.calledOnceWithExactly(h.restore, ROOT.fsPath, "/backups/squad-upstream-1");
    });

    test("does not restore when there was no manifest to back up", async () => {
      const h = createHarness();
      h.backup.resolves(null);
      h.execute.resolves(squadErr({ code: "cli-timeout", message: "timed out" }));

      const result = await h.service.add(ROOT, { source: "../team" });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "cli-timeout");
      sinon.assert.notCalled(h.restore);
    });

    test("reports a failed initial clone as an error, never a success", async () => {
      const h = createHarness([[], [upstream("org")]]);
      h.execute.resolves(
        cliOk('⚠️ Clone failed — run "squad upstream sync" to retry: auth required\n✓ Added upstream: org (git: org/org)')
      );

      const result = await h.service.add(ROOT, { source: "org/org" });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "upstream-failed");
      assert.ok(result.error.message.includes('"org"'));
      assert.ok(result.error.detail?.includes("Clone failed"));
    });

    test("fails when the CLI reports success but the manifest lacks the upstream", async () => {
      const h = createHarness([[], []]);
      h.execute.resolves(cliOk("✓ Added upstream: org (git: org/org)"));

      const result = await h.service.add(ROOT, { source: "org/org", name: "org" });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "upstream-failed");
    });
  });

  suite("sync (FR-032)", () => {
    test("syncs all upstreams when no name is given", async () => {
      const h = createHarness([[upstream("org"), upstream("team")]]);
      h.execute.resolves(cliOk("Syncing 2 upstream(s)...\n✓ org (git — synced)\n✓ team (git — synced)\n2/2 upstream(s) synced."));

      const result = await h.service.sync(ROOT);

      assert.ok(isSquadOk(result));
      assert.deepStrictEqual(h.execute.firstCall.args[1].args, ["sync"]);
      assert.strictEqual(h.execute.firstCall.args[1].timeoutMs, SQUAD_UPSTREAM_TIMEOUTS_MS.sync);
      sinon.assert.calledOnce(h.backup);
    });

    test("syncs a single named upstream", async () => {
      const h = createHarness([[upstream("org")]]);
      h.execute.resolves(cliOk("1/1 upstream(s) synced."));

      const result = await h.service.sync(ROOT, "org");

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.name, "org");
      assert.deepStrictEqual(h.execute.firstCall.args[1].args, ["sync", "org"]);
    });

    test("reports a partial sync (zero exit code) as upstream-failed with the warnings", async () => {
      const h = createHarness([[upstream("org"), upstream("team")]]);
      h.execute.resolves(cliOk("⚠️ team: git sync failed: not found\n✓ org (git — synced)\n1/2 upstream(s) synced."));

      const result = await h.service.sync(ROOT);

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "upstream-failed");
      assert.ok(result.error.message.includes("1/2"));
      assert.ok(result.error.detail?.includes("team: git sync failed"));
      sinon.assert.notCalled(h.restore);
    });

    test("rejects an unknown upstream name without calling the CLI", async () => {
      const h = createHarness([[upstream("org")]]);
      const result = await h.service.sync(ROOT, "missing");
      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "invalid-input");
      sinon.assert.notCalled(h.execute);
    });

    test("explains that there is nothing to sync when no upstream is configured", async () => {
      const h = createHarness([[]]);
      const result = await h.service.sync(ROOT);
      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "invalid-input");
      assert.ok(result.error.remediation?.includes("Add an upstream"));
      sinon.assert.notCalled(h.execute);
    });

    test("propagates cancellation", async () => {
      const h = createHarness([[upstream("org")]]);
      h.execute.resolves(squadErr({ code: "cancelled", message: "The Squad command was cancelled." }));
      const result = await h.service.sync(ROOT, "org");
      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "cancelled");
    });
  });

  suite("remove (FR-032)", () => {
    test("asks for confirmation, backs up, then runs `upstream remove <name>`", async () => {
      const h = createHarness([[upstream("org"), upstream("team")], [upstream("team")]]);
      h.execute.resolves(cliOk("✓ Removed upstream: org"));

      const result = await h.service.remove(ROOT, "org");

      assert.ok(isSquadOk(result));
      assert.deepStrictEqual(
        result.value.upstreams.map((u) => u.id),
        ["team"]
      );
      sinon.assert.calledOnce(h.confirmRemove);
      assert.strictEqual(h.confirmRemove.firstCall.args[0].id, "org");
      assert.ok(h.confirmRemove.calledBefore(h.backup));
      assert.ok(h.backup.calledBefore(h.execute));
      assert.deepStrictEqual(h.execute.firstCall.args[1].args, ["remove", "org"]);
    });

    test("does nothing when the user declines the confirmation", async () => {
      const h = createHarness([[upstream("org")]]);
      h.confirmRemove.resolves(false);

      const result = await h.service.remove(ROOT, "org");

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "cancelled");
      sinon.assert.notCalled(h.backup);
      sinon.assert.notCalled(h.execute);
    });

    test("rejects an unknown or empty name without prompting", async () => {
      const h = createHarness([[upstream("org")]]);

      const missing = await h.service.remove(ROOT, "missing");
      const empty = await h.service.remove(ROOT, " ");

      assert.ok(isSquadErr(missing));
      assert.ok(isSquadErr(empty));
      assert.strictEqual(missing.error.code, "invalid-input");
      assert.strictEqual(empty.error.code, "invalid-input");
      sinon.assert.notCalled(h.confirmRemove);
      sinon.assert.notCalled(h.execute);
    });

    test("fails when the upstream is still present after a successful CLI exit", async () => {
      const h = createHarness([[upstream("org")], [upstream("org")]]);
      const result = await h.service.remove(ROOT, "org");
      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "upstream-failed");
    });

    test("reports a failed restore alongside the CLI error", async () => {
      const h = createHarness([[upstream("org")]]);
      h.execute.resolves(squadErr({ code: "cli-execution-failed", message: "boom", remediation: "retry" }));
      h.restore.rejects(new Error("locked"));

      const result = await h.service.remove(ROOT, "org");

      assert.ok(isSquadErr(result));
      assert.ok(result.error.remediation?.includes("/backups/squad-upstream-1"));
    });
  });
});
