/**
 * SQD-041 (#256) — Squad feature flows end-to-end against a simulated CLI.
 *
 * Each flow wires the real feature service to the real allowlisted
 * {@link SquadCliService}, backed by the shared {@link FakeSquadCli} (no
 * process, no network, no file writes):
 * - FR-005 / #245 — CLI update detection (`squad version` probe + npm latest,
 *   the npm registry is replaced by an in-memory provider).
 * - FR-031 / FR-032 / #251 — upstream add / sync / remove / list.
 * - FR-044 / #254 — plugin marketplace + lifecycle actions and plugin listing.
 *
 * Every flow covers success, CLI failure, timeout, missing CLI and
 * non-allowed input; failures must be visible, actionable and never success.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  NEXUS_SQUAD_MARKETPLACE_REPO,
  SquadInstallState,
  SquadMarketplaceKind,
  SquadPluginAction,
  SquadPluginStatus,
  SquadUpgradeCommand,
  SquadUpstreamKind,
  SquadVersionStatus,
  squadErr,
  squadOk,
  type SquadError,
  type SquadMarketplaceRef,
  type SquadResult,
  type SquadUpstreamSource,
} from "../../src/features/squad/models";
import { SquadDetectionService, type SquadFileReader } from "../../src/features/squad/services/squadDetectionService";
import { SquadPluginActionService } from "../../src/features/squad/services/squadPluginActionService";
import { SquadPluginService } from "../../src/features/squad/services/squadPluginService";
import { SquadUpdateService, type SquadLatestVersionProvider } from "../../src/features/squad/services/squadUpdateService";
import { SQUAD_UPSTREAM_TIMEOUTS_MS, SquadUpstreamService } from "../../src/features/squad/services/squadUpstreamService";
import { FakeSquadCli, fakeSquadReply, silentLogger } from "./helpers/fakeSquadCli";

const WORKSPACE = vscode.Uri.file(process.platform === "win32" ? "C:\\work\\repo" : "/work/repo");

function expectErr<T>(result: SquadResult<T>, code: SquadError["code"]): SquadError {
  assert.strictEqual(result.ok, false, "a failure must never be reported as success");
  if (result.ok) {
    throw new Error("unreachable");
  }
  assert.strictEqual(result.error.code, code, `unexpected error: ${result.error.message}`);
  assert.ok(result.error.message.trim().length > 0, "error message must be visible");
  assert.ok(result.error.remediation && result.error.remediation.trim().length > 0, "error must be actionable");
  return result.error;
}

function expectOk<T>(result: SquadResult<T>): T {
  if (!result.ok) {
    assert.fail(`expected success but got ${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

suite("Unit: Squad flows with a simulated CLI (SQD-041)", () => {
  suite("CLI update detection (FR-005, #245)", () => {
    /** In-memory Squad project whose agent file is stamped with `projectVersion`. */
    function projectFiles(projectVersion: string): SquadFileReader {
      return {
        exists: async () => true,
        readFile: async () => `<!-- version: ${projectVersion} -->\n\n# Squad\n`,
      };
    }

    function latest(version: string): SquadLatestVersionProvider {
      return {
        getLatestCliVersion: async () => squadOk(version),
        getLatestProjectVersion: async () => squadOk(version),
      };
    }

    function createUpdateService(
      fake: FakeSquadCli,
      options: { latestVersion?: SquadLatestVersionProvider; cliTimeoutMs?: number } = {}
    ): SquadUpdateService {
      // An empty custom path makes the custom probe short-circuit without a spawn,
      // so only the global `squad version` probe reaches the simulated CLI.
      const cli = fake.createService({ customCliPath: "" });
      const detection = new SquadDetectionService({
        fileReader: projectFiles("0.9.0"),
        cliService: cli,
        logger: silentLogger,
        cliTimeoutMs: options.cliTimeoutMs ?? 1_000,
        now: () => 1,
      });
      return new SquadUpdateService({
        detectionService: detection,
        latestVersionProvider: options.latestVersion ?? latest("1.0.0"),
        logger: silentLogger,
        now: () => 2,
      });
    }

    test("reports a CLI update from `squad version` without running any upgrade", async () => {
      const fake = new FakeSquadCli().on(["version"], fakeSquadReply.ok("squad-cli 0.9.1\n"));

      const updates = expectOk(await createUpdateService(fake).checkUpdates(WORKSPACE));

      assert.strictEqual(updates.detection.cli.installed, true);
      assert.strictEqual(updates.cli.currentVersion, "0.9.1");
      assert.strictEqual(updates.cli.latestVersion, "1.0.0");
      assert.strictEqual(updates.cli.status, SquadVersionStatus.UpdateAvailable);
      assert.strictEqual(updates.cli.updateAvailable, true);
      assert.strictEqual(updates.cli.upgradeCommand, SquadUpgradeCommand.CliSelf);
      assert.strictEqual(updates.cli.requiresConfirmation, true);
      assert.strictEqual(updates.project.updateAvailable, true);
      assert.strictEqual(updates.project.upgradeCommand, SquadUpgradeCommand.Project);
      assert.strictEqual(updates.project.requiresBackup, true);
      assert.deepStrictEqual(
        fake.calls.map((c) => c.squadArgs),
        [["version"]],
        "detection only probes the version; it never upgrades"
      );
      assert.strictEqual(fake.lastCall?.request.command, "squad");
      assert.strictEqual(fake.lastCall?.request.timeoutMs, 1_000);
    });

    test("reports up to date when the simulated CLI is on the latest version", async () => {
      const fake = new FakeSquadCli().on(["version"], fakeSquadReply.ok("1.0.0"));

      const updates = expectOk(await createUpdateService(fake).checkUpdates(WORKSPACE));

      assert.strictEqual(updates.cli.status, SquadVersionStatus.UpToDate);
      assert.strictEqual(updates.cli.updateAvailable, false);
    });

    const unavailable: Array<{ name: string; reply: Parameters<FakeSquadCli["on"]>[1]; cliTimeoutMs?: number }> = [
      { name: "exits non-zero", reply: fakeSquadReply.fail(1, "Error: corrupted install") },
      { name: "times out", reply: fakeSquadReply.timeout() },
      { name: "hangs until the probe timeout", reply: fakeSquadReply.hang(), cliTimeoutMs: 15 },
      { name: "is not installed (ENOENT)", reply: fakeSquadReply.notFound() },
      { name: "prints no version", reply: fakeSquadReply.ok("squad ready") },
    ];

    for (const { name, reply, cliTimeoutMs } of unavailable) {
      test(`never reports a CLI update when \`squad version\` ${name}`, async () => {
        const fake = new FakeSquadCli().on(["version"], reply);

        const updates = expectOk(await createUpdateService(fake, { cliTimeoutMs }).checkUpdates(WORKSPACE));

        assert.strictEqual(updates.detection.cli.installed, false);
        assert.strictEqual(updates.cli.currentVersion, null);
        assert.strictEqual(updates.cli.status, SquadVersionStatus.Unknown);
        assert.strictEqual(updates.cli.updateAvailable, false, "an unusable CLI must not look upgradable");
        assert.match(updates.cli.message, /unknown/i);
        assert.strictEqual(updates.detection.project.installState, SquadInstallState.Installed);
        assert.strictEqual(fake.spawnCount, 1);
      });
    }

    test("an unreachable update source fails visibly and spawns nothing", async () => {
      const fake = new FakeSquadCli().on(["version"], fakeSquadReply.ok("0.9.1"));
      const offline: SquadLatestVersionProvider = {
        getLatestCliVersion: async () =>
          squadErr({ code: "update-check-failed", message: "offline", remediation: "Check your network." }),
        getLatestProjectVersion: async () => squadOk("1.0.0"),
      };

      expectErr(await createUpdateService(fake, { latestVersion: offline }).checkUpdates(WORKSPACE), "update-check-failed");
      assert.strictEqual(fake.spawnCount, 0);
    });
  });

  suite("upstream actions (FR-031/FR-032, #251)", () => {
    function upstream(id: string): SquadUpstreamSource {
      return { id, kind: SquadUpstreamKind.Git, reference: `https://github.com/org/${id}.git` };
    }

    interface UpstreamHarness {
      service: SquadUpstreamService;
      backup: sinon.SinonStub;
      restore: sinon.SinonStub;
      confirmRemove: sinon.SinonStub;
    }

    /** `manifests[i]` is what `.squad/upstream.json` holds at the i-th read. */
    function createUpstreamService(fake: FakeSquadCli, manifests: SquadUpstreamSource[][]): UpstreamHarness {
      const readUpstreams = sinon.stub();
      manifests.forEach((list, i) => readUpstreams.onCall(i).resolves(squadOk(list)));
      readUpstreams.resolves(squadOk(manifests[manifests.length - 1]));
      const backup = sinon.stub().resolves("/backups/upstream-1");
      const restore = sinon.stub().resolves();
      const confirmRemove = sinon.stub().resolves(true);
      const service = new SquadUpstreamService({
        cli: fake.createService(),
        backup: { backupSquadUpstreamManifest: backup, restoreSquadUpstreamManifest: restore },
        confirmer: { confirmRemove },
        createReader: () => ({ readUpstreams }),
        logger: silentLogger,
      });
      return { service, backup, restore, confirmRemove };
    }

    test("add runs `squad upstream add` after a backup and returns the re-read manifest", async () => {
      const fake = new FakeSquadCli().on(
        ["upstream", "add"],
        fakeSquadReply.ok("\u001b[32m✓\u001b[0m Added upstream: org (git: https://github.com/org/org.git)")
      );
      const h = createUpstreamService(fake, [[], [upstream("org")]]);

      const outcome = expectOk(
        await h.service.add(WORKSPACE, { source: "https://github.com/org/org.git", name: "org", ref: "main" })
      );

      assert.deepStrictEqual(fake.lastCall?.squadArgs, [
        "upstream",
        "add",
        "https://github.com/org/org.git",
        "--name",
        "org",
        "--ref",
        "main",
      ]);
      assert.strictEqual(fake.lastCall?.request.cwd, WORKSPACE.fsPath);
      assert.strictEqual(fake.lastCall?.request.timeoutMs, SQUAD_UPSTREAM_TIMEOUTS_MS.add);
      sinon.assert.calledOnceWithExactly(h.backup, WORKSPACE.fsPath);
      sinon.assert.notCalled(h.restore);
      assert.strictEqual(outcome.name, "org");
      assert.deepStrictEqual(outcome.upstreams, [upstream("org")]);
      assert.strictEqual(outcome.backupPath, "/backups/upstream-1");
    });

    test("add failing in the CLI restores the backup and reports a contextual error", async () => {
      const fake = new FakeSquadCli().on(["upstream", "add"], fakeSquadReply.fail(1, "Error: repository not found"));
      const h = createUpstreamService(fake, [[]]);

      const error = expectErr(await h.service.add(WORKSPACE, { source: "org/missing" }), "cli-execution-failed");

      assert.match(error.message, /^Adding the Squad upstream failed\..*repository not found/);
      sinon.assert.calledOnceWithExactly(h.restore, WORKSPACE.fsPath, "/backups/upstream-1");
    });

    test("add whose initial clone warns (exit 0) is upstream-failed, not success", async () => {
      const fake = new FakeSquadCli().on(
        ["upstream", "add"],
        fakeSquadReply.ok("✓ Added upstream: org (git: org/org)\n⚠️ Initial clone failed: auth required")
      );
      const h = createUpstreamService(fake, [[], [upstream("org")]]);

      const error = expectErr(await h.service.add(WORKSPACE, { source: "org/org" }), "upstream-failed");

      assert.match(error.detail ?? "", /auth required/);
    });

    test("add reported as success but absent from the manifest is upstream-failed", async () => {
      const fake = new FakeSquadCli().on(["upstream", "add"], fakeSquadReply.ok("✓ Added upstream: ghost (git: o/ghost)"));
      const h = createUpstreamService(fake, [[], []]);

      expectErr(await h.service.add(WORKSPACE, { source: "o/ghost" }), "upstream-failed");
    });

    test("sync timing out restores the backup and reports cli-timeout", async () => {
      const fake = new FakeSquadCli().on(["upstream", "sync"], fakeSquadReply.timeout());
      const h = createUpstreamService(fake, [[upstream("org")]]);

      const error = expectErr(await h.service.sync(WORKSPACE), "cli-timeout");

      assert.strictEqual(error.detail, `timeoutMs=${SQUAD_UPSTREAM_TIMEOUTS_MS.sync}`);
      assert.strictEqual(fake.lastCall?.request.timeoutMs, SQUAD_UPSTREAM_TIMEOUTS_MS.sync);
      sinon.assert.calledOnce(h.restore);
    });

    test("sync of a single upstream succeeds with the targeted argv", async () => {
      const fake = new FakeSquadCli().on(["upstream", "sync"], fakeSquadReply.ok("✓ org (git — synced)\n1/1 upstream(s) synced."));
      const h = createUpstreamService(fake, [[upstream("org"), upstream("team")]]);

      const outcome = expectOk(await h.service.sync(WORKSPACE, "org"));

      assert.deepStrictEqual(fake.lastCall?.squadArgs, ["upstream", "sync", "org"]);
      assert.strictEqual(outcome.name, "org");
    });

    test("a partial sync (exit 0) is upstream-failed with counts", async () => {
      const fake = new FakeSquadCli().on(
        ["upstream", "sync"],
        fakeSquadReply.ok("⚠️ team: git sync failed: not found\n✓ org (git — synced)\n1/2 upstream(s) synced.")
      );
      const h = createUpstreamService(fake, [[upstream("org"), upstream("team")]]);

      const error = expectErr(await h.service.sync(WORKSPACE), "upstream-failed");

      assert.match(error.message, /1\/2 synced/);
    });

    test("remove with a missing CLI is cli-not-found and restores the backup", async () => {
      const fake = new FakeSquadCli().on(["upstream", "remove"], fakeSquadReply.notFound());
      const h = createUpstreamService(fake, [[upstream("org")]]);

      expectErr(await h.service.remove(WORKSPACE, "org"), "cli-not-found");

      sinon.assert.calledOnce(h.confirmRemove);
      sinon.assert.calledOnce(h.restore);
    });

    test("remove succeeds only when the manifest no longer lists the upstream", async () => {
      const fake = new FakeSquadCli().on(["upstream", "remove"], fakeSquadReply.ok("✓ Removed upstream: org"));

      const removed = createUpstreamService(fake, [[upstream("org")], []]);
      assert.deepStrictEqual(expectOk(await removed.service.remove(WORKSPACE, "org")).upstreams, []);
      assert.deepStrictEqual(fake.lastCall?.squadArgs, ["upstream", "remove", "org"]);

      const stale = createUpstreamService(fake, [[upstream("org")], [upstream("org")]]);
      expectErr(await stale.service.remove(WORKSPACE, "org"), "upstream-failed");
    });

    test("list runs `squad upstream list` and returns the manifest", async () => {
      const fake = new FakeSquadCli().on(["upstream", "list"], fakeSquadReply.ok("Configured upstreams:\n  org"));
      const h = createUpstreamService(fake, [[upstream("org")]]);

      const outcome = expectOk(await h.service.list(WORKSPACE));

      assert.deepStrictEqual(outcome.upstreams, [upstream("org")]);
      assert.deepStrictEqual(outcome.output, ["Configured upstreams:", "org"]);
      sinon.assert.notCalled(h.backup);
    });

    const rejected: Array<{ name: string; run: (s: SquadUpstreamService) => Promise<SquadResult<unknown>> }> = [
      { name: "a source that is a git option", run: (s) => s.add(WORKSPACE, { source: "--upload-pack=touch /tmp/x" }) },
      { name: "a source with shell metacharacters", run: (s) => s.add(WORKSPACE, { source: "org/repo & calc" }) },
      { name: "a source with a newline", run: (s) => s.add(WORKSPACE, { source: "org/repo\nrm" }) },
      { name: "a name with a shell separator", run: (s) => s.add(WORKSPACE, { source: "org/repo", name: "x;rm" }) },
      { name: "a ref that is an option", run: (s) => s.add(WORKSPACE, { source: "org/repo", ref: "-oProxyCommand=x" }) },
      { name: "a sync target that is an option", run: (s) => s.sync(WORKSPACE, "--all") },
      { name: "a remove target that is an option", run: (s) => s.remove(WORKSPACE, "-rf") },
    ];

    for (const { name, run } of rejected) {
      test(`rejects ${name} before the CLI or a backup runs`, async () => {
        const fake = new FakeSquadCli().on([], fakeSquadReply.ok("should never run"));
        const h = createUpstreamService(fake, [[upstream("org")]]);

        expectErr(await run(h.service), "invalid-input");

        assert.strictEqual(fake.spawnCount, 0);
        sinon.assert.notCalled(h.backup);
      });
    }

    test("a declined removal spawns nothing", async () => {
      const fake = new FakeSquadCli().on([], fakeSquadReply.ok());
      const h = createUpstreamService(fake, [[upstream("org")]]);
      h.confirmRemove.resolves(false);

      expectErr(await h.service.remove(WORKSPACE, "org"), "cancelled");
      assert.strictEqual(fake.spawnCount, 0);
      sinon.assert.notCalled(h.backup);
    });
  });

  suite("plugin marketplace and lifecycle actions (FR-044, #254)", () => {
    function marketplace(id: string, source: string): SquadMarketplaceRef {
      return { id, source, kind: SquadMarketplaceKind.GitHub, enabled: true };
    }

    interface PluginHarness {
      actions: SquadPluginActionService;
      plugins: SquadPluginService;
      confirm: sinon.SinonStub;
      backup: sinon.SinonStub;
    }

    function createPluginServices(fake: FakeSquadCli, marketplaces: SquadMarketplaceRef[] = []): PluginHarness {
      const cli = fake.createService();
      const plugins = new SquadPluginService({
        fileService: { readPluginMarketplaces: async () => squadOk(marketplaces) } as never,
        cli,
        logger: silentLogger,
      });
      const confirm = sinon.stub().resolves(true);
      const backup = sinon.stub().resolves("/backups/squad-1");
      const actions = new SquadPluginActionService({
        cli,
        plugins,
        backup: { backupSquadArtifacts: backup, restoreSquadArtifacts: sinon.stub() },
        confirmer: { confirm },
        logger: silentLogger,
        getWorkspaceRoot: () => WORKSPACE,
      });
      return { actions, plugins, confirm, backup };
    }

    const lifecycle: Array<{ action: SquadPluginAction; target: string; argv: string[]; writes: boolean }> = [
      { action: SquadPluginAction.Validate, target: "./plugins/p", argv: ["plugin", "validate", "./plugins/p"], writes: false },
      { action: SquadPluginAction.DryRun, target: "./plugins/p", argv: ["plugin", "dry-run", "./plugins/p"], writes: false },
      { action: SquadPluginAction.Install, target: "./plugins/p", argv: ["plugin", "install", "./plugins/p"], writes: true },
      { action: SquadPluginAction.Enable, target: "@org/p", argv: ["plugin", "enable", "@org/p"], writes: true },
      { action: SquadPluginAction.Disable, target: "@org/p", argv: ["plugin", "disable", "@org/p"], writes: true },
      { action: SquadPluginAction.Uninstall, target: "@org/p", argv: ["plugin", "uninstall", "@org/p"], writes: true },
      { action: SquadPluginAction.Refresh, target: "@org/p", argv: ["plugin", "refresh", "@org/p"], writes: true },
      {
        action: SquadPluginAction.AddMarketplace,
        target: "https://github.com/acme/market.git",
        argv: ["plugin", "marketplace", "add", "acme/market"],
        writes: true,
      },
      {
        action: SquadPluginAction.AddNexusMarketplace,
        target: "",
        argv: ["plugin", "marketplace", "add", NEXUS_SQUAD_MARKETPLACE_REPO],
        writes: true,
      },
    ];

    for (const { action, target, argv, writes } of lifecycle) {
      test(`\`${action}\` succeeds through \`squad ${argv.slice(1).join(" ")}\``, async () => {
        const fake = new FakeSquadCli().on(["plugin"], fakeSquadReply.ok("\u001b[32m✓\u001b[0m done"));
        const h = createPluginServices(fake);

        const outcome = expectOk(await h.actions.runAction({ action, target }));

        assert.deepStrictEqual(fake.lastCall?.squadArgs, argv);
        assert.strictEqual(fake.lastCall?.request.cwd, WORKSPACE.fsPath);
        assert.strictEqual(outcome.changed, writes);
        assert.strictEqual(outcome.backedUp, writes);
        assert.strictEqual(outcome.output, "✓ done");
        assert.strictEqual(h.confirm.called, writes, "only write actions ask for confirmation");
        if (writes) {
          assert.ok(h.confirm.calledBefore(h.backup), "confirmation must precede the backup");
        }
      });
    }

    test("remove marketplace targets a registered marketplace", async () => {
      const fake = new FakeSquadCli().on(["plugin", "marketplace", "remove"], fakeSquadReply.ok());
      const h = createPluginServices(fake, [marketplace("acme", "acme/market")]);

      expectOk(await h.actions.runAction({ action: SquadPluginAction.RemoveMarketplace, target: "acme" }));

      assert.deepStrictEqual(fake.lastCall?.squadArgs, ["plugin", "marketplace", "remove", "acme"]);
    });

    test("a failing install is plugin-action-failed and points at the backup", async () => {
      const fake = new FakeSquadCli().on(["plugin", "install"], fakeSquadReply.fail(1, "Error: manifest missing"));
      const h = createPluginServices(fake);

      const error = expectErr(
        await h.actions.runAction({ action: SquadPluginAction.Install, target: "./plugins/p" }),
        "plugin-action-failed"
      );

      assert.match(error.message, /Install plugin failed for "\.\/plugins\/p"/);
      assert.match(error.remediation ?? "", /manifest missing/);
      assert.match(error.remediation ?? "", /backup/i);
    });

    test("a timed-out enable is cli-timeout and still points at the backup", async () => {
      const fake = new FakeSquadCli().on(["plugin", "enable"], fakeSquadReply.timeout());
      const h = createPluginServices(fake);

      const error = expectErr(await h.actions.runAction({ action: SquadPluginAction.Enable, target: "p" }), "cli-timeout");

      assert.match(error.remediation ?? "", /backup/i);
      assert.strictEqual(fake.lastCall?.request.timeoutMs, 60_000);
    });

    test("a read-only validate with a missing CLI is cli-not-found and takes no backup", async () => {
      const fake = new FakeSquadCli().on(["plugin", "validate"], fakeSquadReply.notFound());
      const h = createPluginServices(fake);

      const error = expectErr(
        await h.actions.runAction({ action: SquadPluginAction.Validate, target: "./p" }),
        "cli-not-found"
      );

      assert.doesNotMatch(error.remediation ?? "", /backup/i);
      sinon.assert.notCalled(h.backup);
    });

    test("cancelling a hung uninstall reports cancelled", async () => {
      const fake = new FakeSquadCli().on(["plugin", "uninstall"], fakeSquadReply.hang());
      const h = createPluginServices(fake);
      const source = new vscode.CancellationTokenSource();

      const pending = h.actions.runAction({ action: SquadPluginAction.Uninstall, target: "p" }, { token: source.token });
      setTimeout(() => source.cancel(), 5);

      expectErr(await pending, "cancelled");
      source.dispose();
    });

    const rejected: Array<{ name: string; action: string; target?: string }> = [
      { name: "an unknown action", action: "publish", target: "p" },
      { name: "a plugin id that is an option", action: SquadPluginAction.Enable, target: "--global" },
      { name: "a plugin id with a shell separator", action: SquadPluginAction.Disable, target: "p;calc" },
      { name: "a plugin directory that is an option", action: SquadPluginAction.Install, target: "-rf" },
      { name: "a plugin directory with a newline", action: SquadPluginAction.Install, target: "./p\n--force" },
      { name: "a marketplace source that is not owner/repo", action: SquadPluginAction.AddMarketplace, target: "evil.com/a/b" },
      { name: "a marketplace name with spaces", action: SquadPluginAction.RemoveMarketplace, target: "a b" },
      { name: "a missing target", action: SquadPluginAction.Uninstall },
    ];

    for (const { name, action, target } of rejected) {
      test(`rejects ${name} before confirming, backing up or spawning`, async () => {
        const fake = new FakeSquadCli().on([], fakeSquadReply.ok("should never run"));
        const h = createPluginServices(fake);

        expectErr(
          await h.actions.runAction({ action: action as SquadPluginAction, target }),
          "plugin-action-failed"
        );

        assert.strictEqual(fake.spawnCount, 0);
        sinon.assert.notCalled(h.confirm);
        sinon.assert.notCalled(h.backup);
      });
    }

    test("a declined write action spawns nothing", async () => {
      const fake = new FakeSquadCli().on([], fakeSquadReply.ok());
      const h = createPluginServices(fake);
      h.confirm.resolves(false);

      expectErr(await h.actions.runAction({ action: SquadPluginAction.Uninstall, target: "p" }), "cancelled");
      assert.strictEqual(fake.spawnCount, 0);
      sinon.assert.notCalled(h.backup);
    });

    suite("installed plugin list", () => {
      test("parses `squad plugin list --json`", async () => {
        const fake = new FakeSquadCli().on(
          ["plugin", "list", "--json"],
          fakeSquadReply.ok(JSON.stringify({ plugins: [{ id: "p", enabled: false, version: "1.0.0" }] }))
        );

        const plugins = expectOk(await createPluginServices(fake).plugins.listInstalledPlugins({ cwd: WORKSPACE }));

        assert.deepStrictEqual(
          plugins.map((p) => [p.id, p.status, p.version]),
          [["p", SquadPluginStatus.Disabled, "1.0.0"]]
        );
      });

      test("a failing list is plugin-list-failed, not an empty success", async () => {
        const fake = new FakeSquadCli().on(["plugin", "list"], fakeSquadReply.fail(1, "boom"));

        expectErr(await createPluginServices(fake).plugins.listInstalledPlugins(), "plugin-list-failed");
      });

      test("a timed-out list is plugin-list-failed", async () => {
        const fake = new FakeSquadCli().on(["plugin", "list"], fakeSquadReply.timeout());

        const error = expectErr(await createPluginServices(fake).plugins.listInstalledPlugins(), "plugin-list-failed");

        assert.match(error.detail ?? "", /timeoutMs=/);
      });

      test("a missing CLI is cli-not-found with install remediation", async () => {
        const fake = new FakeSquadCli().on(["plugin", "list"], fakeSquadReply.notFound());

        const error = expectErr(await createPluginServices(fake).plugins.listInstalledPlugins(), "cli-not-found");

        assert.match(error.remediation ?? "", /npm install -g/);
      });

      test("non-JSON output is plugin-list-failed", async () => {
        const fake = new FakeSquadCli().on(["plugin", "list"], fakeSquadReply.ok("Installed plugins:\n  p"));

        expectErr(await createPluginServices(fake).plugins.listInstalledPlugins(), "plugin-list-failed");
      });
    });
  });
});
