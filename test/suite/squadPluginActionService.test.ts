/**
 * Tests for SquadPluginActionService (SQD-039, FR-040/FR-041/FR-044).
 *
 * The Squad CLI is mocked through a fake {@link SquadProcessRunner} behind the
 * real allowlisted {@link SquadCliService}, so argv construction and allowlist
 * compatibility are verified without spawning a process.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  NEXUS_SQUAD_MARKETPLACE_REPO,
  SquadCliSource,
  SquadMarketplaceKind,
  SquadMarketplaceRef,
  SquadPluginAction,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";
import { SquadCliService } from "../../src/features/squad/services/squadCliService";
import type { SquadPluginActionConfirmer } from "../../src/features/squad/services/squadPluginActionConfirmer";
import { SquadPluginActionService } from "../../src/features/squad/services/squadPluginActionService";
import type {
  SquadProcessRunner,
  SquadSpawnRequest,
  SquadSpawnResult,
} from "../../src/features/squad/services/squadProcessRunner";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

const WORKSPACE = vscode.Uri.file(process.platform === "win32" ? "C:\\work\\repo" : "/work/repo");

interface Harness {
  service: SquadPluginActionService;
  run: sinon.SinonStub<[SquadSpawnRequest], Promise<SquadSpawnResult>>;
  confirm: sinon.SinonStub;
  backupSquadArtifacts: sinon.SinonStub;
  readMarketplaces: sinon.SinonStub;
}

function spawnResult(overrides: Partial<SquadSpawnResult> = {}): SquadSpawnResult {
  return { stdout: "", stderr: "", exitCode: 0, timedOut: false, cancelled: false, ...overrides };
}

function marketplace(id: string, source: string): SquadMarketplaceRef {
  return { id, source, kind: SquadMarketplaceKind.GitHub, enabled: true };
}

function createHarness(
  options: {
    spawn?: Partial<SquadSpawnResult>;
    confirmed?: boolean;
    marketplaces?: SquadMarketplaceRef[];
    workspace?: vscode.Uri | undefined;
  } = {}
): Harness {
  const run = sinon
    .stub<[SquadSpawnRequest], Promise<SquadSpawnResult>>()
    .resolves(spawnResult(options.spawn));
  const runner: SquadProcessRunner = { run };
  const cli = new SquadCliService({ runner, logger: silentLogger, cliSource: SquadCliSource.Global });
  const confirm = sinon.stub().resolves(options.confirmed ?? true);
  const confirmer: SquadPluginActionConfirmer = { confirm };
  const backupSquadArtifacts = sinon.stub().resolves("/backups/squad-1");
  const readMarketplaces = sinon.stub().resolves(squadOk(options.marketplaces ?? []));
  const workspace = "workspace" in options ? options.workspace : WORKSPACE;

  const service = new SquadPluginActionService({
    cli,
    plugins: { readMarketplaces } as never,
    backup: { backupSquadArtifacts, restoreSquadArtifacts: sinon.stub() },
    confirmer,
    logger: silentLogger,
    getWorkspaceRoot: () => workspace,
  });
  return { service, run, confirm, backupSquadArtifacts, readMarketplaces };
}

suite("Unit: SquadPluginActionService", () => {
  suite("marketplaces (FR-040/FR-041)", () => {
    test("pre-registers the Nexus marketplace after confirmation and backup", async () => {
      const h = createHarness({ spawn: { stdout: "\u001b[32m✓\u001b[0m Registered marketplace" } });

      const result = await h.service.runAction({ action: SquadPluginAction.AddNexusMarketplace });

      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(h.run.firstCall.args[0].args, [
        "plugin",
        "marketplace",
        "add",
        NEXUS_SQUAD_MARKETPLACE_REPO,
      ]);
      assert.strictEqual(h.run.firstCall.args[0].cwd, WORKSPACE.fsPath);
      sinon.assert.calledOnce(h.confirm);
      sinon.assert.calledOnceWithExactly(h.backupSquadArtifacts, WORKSPACE.fsPath);
      assert.ok(h.confirm.calledBefore(h.backupSquadArtifacts));
      assert.ok(h.backupSquadArtifacts.calledBefore(h.run));
      if (result.ok) {
        assert.strictEqual(result.value.changed, true);
        assert.strictEqual(result.value.backedUp, true);
        assert.strictEqual(result.value.output, "✓ Registered marketplace", "ANSI codes are stripped");
      }
    });

    test("is a no-op success when the Nexus marketplace is already registered", async () => {
      const h = createHarness({
        marketplaces: [marketplace("nexus-plugin-marketplace", NEXUS_SQUAD_MARKETPLACE_REPO.toLowerCase())],
      });

      const result = await h.service.runAction({ action: SquadPluginAction.AddNexusMarketplace });

      assert.strictEqual(result.ok, true);
      sinon.assert.notCalled(h.confirm);
      sinon.assert.notCalled(h.backupSquadArtifacts);
      sinon.assert.notCalled(h.run);
      if (result.ok) {
        assert.strictEqual(result.value.changed, false);
      }
    });

    test("adds a free marketplace, normalising a GitHub URL to owner/repo", async () => {
      const h = createHarness();

      const result = await h.service.runAction({
        action: SquadPluginAction.AddMarketplace,
        target: " https://github.com/acme/squad-plugins.git ",
      });

      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(h.run.firstCall.args[0].args, ["plugin", "marketplace", "add", "acme/squad-plugins"]);
      assert.strictEqual(h.confirm.firstCall.args[0].commandPreview, "squad plugin marketplace add acme/squad-plugins");
    });

    test("rejects an invalid marketplace source before anything runs", async () => {
      const h = createHarness();

      const result = await h.service.runAction({ action: SquadPluginAction.AddMarketplace, target: "not a repo" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "plugin-action-failed");
        assert.match(result.error.remediation ?? "", /owner\/repo/);
      }
      sinon.assert.notCalled(h.confirm);
      sinon.assert.notCalled(h.run);
    });

    test("refuses to write when marketplaces.json is malformed", async () => {
      const h = createHarness();
      h.readMarketplaces.resolves(
        squadErr({ code: "parse-failed", message: "Bad JSON", remediation: "Fix the file." })
      );

      const result = await h.service.runAction({ action: SquadPluginAction.AddMarketplace, target: "acme/plugins" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "parse-failed");
        assert.match(result.error.remediation ?? "", /not overwritten/);
      }
      sinon.assert.notCalled(h.run);
    });

    test("removes a registered marketplace with a destructive confirmation", async () => {
      const h = createHarness({ marketplaces: [marketplace("plugins", "acme/plugins")] });

      const result = await h.service.runAction({ action: SquadPluginAction.RemoveMarketplace, target: "plugins" });

      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(h.run.firstCall.args[0].args, ["plugin", "marketplace", "remove", "plugins"]);
      assert.strictEqual(h.confirm.firstCall.args[0].descriptor.destructive, true);
    });

    test("fails visibly when removing an unknown marketplace", async () => {
      const h = createHarness({ marketplaces: [marketplace("plugins", "acme/plugins")] });

      const result = await h.service.runAction({ action: SquadPluginAction.RemoveMarketplace, target: "ghost" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "plugin-action-failed");
      }
      sinon.assert.notCalled(h.run);
    });
  });

  suite("lifecycle (FR-044)", () => {
    for (const action of [SquadPluginAction.Validate, SquadPluginAction.DryRun]) {
      test(`${action} is read-only: no confirmation and no backup`, async () => {
        const h = createHarness({ spawn: { stdout: "Plugin manifest is valid: team@1.0.0" } });

        const result = await h.service.runAction({ action, target: "./plugins/team" });

        assert.strictEqual(result.ok, true);
        assert.deepStrictEqual(h.run.firstCall.args[0].args, ["plugin", action, "./plugins/team"]);
        sinon.assert.notCalled(h.confirm);
        sinon.assert.notCalled(h.backupSquadArtifacts);
        if (result.ok) {
          assert.strictEqual(result.value.changed, false);
          assert.strictEqual(result.value.backedUp, false);
          assert.match(result.value.output, /valid/);
        }
      });
    }

    test("install runs with confirmation and backup", async () => {
      const h = createHarness();

      const result = await h.service.runAction({ action: SquadPluginAction.Install, target: "./plugins/team" });

      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(h.run.firstCall.args[0].args, ["plugin", "install", "./plugins/team"]);
      sinon.assert.calledOnce(h.confirm);
      sinon.assert.calledOnce(h.backupSquadArtifacts);
    });

    for (const action of [
      SquadPluginAction.Enable,
      SquadPluginAction.Disable,
      SquadPluginAction.Uninstall,
      SquadPluginAction.Refresh,
    ]) {
      test(`${action} passes the plugin id and requires confirmation`, async () => {
        const h = createHarness();

        const result = await h.service.runAction({ action, target: "@acme/team-plugin" });

        assert.strictEqual(result.ok, true);
        assert.deepStrictEqual(h.run.firstCall.args[0].args, ["plugin", action, "@acme/team-plugin"]);
        sinon.assert.calledOnce(h.confirm);
        sinon.assert.calledOnce(h.backupSquadArtifacts);
      });
    }

    test("rejects a plugin id that looks like a flag", async () => {
      const h = createHarness();

      const result = await h.service.runAction({ action: SquadPluginAction.Uninstall, target: "--force" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "plugin-action-failed");
      }
      sinon.assert.notCalled(h.run);
    });

    test("requires a target for lifecycle actions", async () => {
      const h = createHarness();

      const result = await h.service.runAction({ action: SquadPluginAction.Enable });

      assert.strictEqual(result.ok, false);
      sinon.assert.notCalled(h.run);
    });
  });

  suite("safety and errors", () => {
    test("declined confirmation returns cancelled and never backs up or runs", async () => {
      const h = createHarness({ confirmed: false });

      const result = await h.service.runAction({ action: SquadPluginAction.Uninstall, target: "team" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cancelled");
      }
      sinon.assert.notCalled(h.backupSquadArtifacts);
      sinon.assert.notCalled(h.run);
    });

    test("backup failure aborts before the CLI runs", async () => {
      const h = createHarness();
      h.backupSquadArtifacts.rejects(new Error("disk full"));

      const result = await h.service.runAction({ action: SquadPluginAction.Install, target: "./plugins/team" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "backup-failed");
        assert.ok(result.error.remediation);
      }
      sinon.assert.notCalled(h.run);
    });

    test("a non-zero CLI exit maps to an actionable plugin-action-failed error", async () => {
      const h = createHarness({ spawn: { exitCode: 1, stderr: 'Plugin "team" is not installed' } });

      const result = await h.service.runAction({ action: SquadPluginAction.Enable, target: "team" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "plugin-action-failed");
        assert.match(result.error.message, /Enable plugin failed for "team"/);
        assert.match(result.error.remediation ?? "", /is not installed/);
        assert.match(result.error.remediation ?? "", /backup/);
      }
    });

    test("a missing CLI keeps its cli-not-found remediation", async () => {
      const h = createHarness({ spawn: { exitCode: null, spawnErrorCode: "ENOENT" } });

      const result = await h.service.runAction({ action: SquadPluginAction.Validate, target: "./plugin" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-not-found");
        assert.match(result.error.remediation ?? "", /npm install -g/);
      }
    });

    test("a CLI timeout surfaces as cli-timeout", async () => {
      const h = createHarness({ spawn: { exitCode: null, timedOut: true } });

      const result = await h.service.runAction({ action: SquadPluginAction.Refresh, target: "team" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "cli-timeout");
      }
    });

    test("fails with not-a-workspace when no folder is open", async () => {
      const h = createHarness({ workspace: undefined });

      const result = await h.service.runAction({ action: SquadPluginAction.AddNexusMarketplace });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "not-a-workspace");
      }
      sinon.assert.notCalled(h.run);
    });

    test("rejects an unknown action", async () => {
      const h = createHarness();

      const result = await h.service.runAction({ action: "switch" as SquadPluginAction, target: "x" });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "plugin-action-failed");
      }
      sinon.assert.notCalled(h.run);
    });
  });
});
