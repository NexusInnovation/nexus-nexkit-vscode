import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { NexkitPanelMessageHandler } from "../../src/features/panel-ui/nexkitPanelMessageHandler";
import { SquadCliUpgradeMessageHandler } from "../../src/features/panel-ui/squadCliUpgradeMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import { runSquadCliUpgradeCommand, SquadCliUpgradeCommandUi } from "../../src/features/squad/commands";
import {
  SquadCliSource,
  SquadCliUpgradeOutcome,
  SquadInstallState,
  SquadUpdatesResult,
  SquadUpdateTarget,
  SquadUpgradeCommand,
  SquadVersionStatus,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

const ROOT = vscode.Uri.file("/workspace/squad");

function updatesAfterUpgrade(): SquadUpdatesResult {
  return {
    detection: {
      project: {
        installState: SquadInstallState.Installed,
        markers: {
          ".squad/config.json": true,
          ".squad/team.md": true,
          ".github/agents/squad.agent.md": true,
        },
        projectVersion: "1.2.0",
        versionStatus: SquadVersionStatus.UpToDate,
      },
      cli: { installed: true, source: SquadCliSource.Global, cliVersion: "1.2.0", versionStatus: SquadVersionStatus.UpToDate },
      detectedAt: 1,
    },
    cli: {
      target: SquadUpdateTarget.Cli,
      currentVersion: "1.2.0",
      latestVersion: "1.2.0",
      status: SquadVersionStatus.UpToDate,
      updateAvailable: false,
      upgradeCommand: SquadUpgradeCommand.CliSelf,
      requiresConfirmation: true,
      requiresBackup: false,
      message: "Squad CLI is up to date (1.2.0).",
    },
    project: {
      target: SquadUpdateTarget.Project,
      currentVersion: "1.2.0",
      latestVersion: "1.2.0",
      status: SquadVersionStatus.UpToDate,
      updateAvailable: false,
      upgradeCommand: SquadUpgradeCommand.Project,
      requiresConfirmation: true,
      requiresBackup: true,
      message: "Squad project is up to date (1.2.0).",
    },
    checkedAt: 2,
  };
}

function outcome(upgraded = true): SquadCliUpgradeOutcome {
  return {
    upgraded,
    previousVersion: upgraded ? "1.0.0" : "1.2.0",
    installedVersion: "1.2.0",
    latestVersion: "1.2.0",
    source: SquadCliSource.Global,
    updates: updatesAfterUpgrade(),
  };
}

const UPGRADE_FAILED = squadErr({
  code: "upgrade-failed",
  message: "The Squad CLI upgrade failed: EACCES",
  remediation: "Run `npm install -g @bradygaster/squad-cli@latest` manually.",
});

suite("Unit: SquadCliUpgradeMessageHandler (SQD-031)", () => {
  let posted: ExtensionMessage[];
  const post = (message: ExtensionMessage): void => {
    posted.push(message);
  };

  setup(() => {
    posted = [];
  });

  test("ignores unrelated messages", async () => {
    const upgradeCli = sinon.stub();
    const handler = new SquadCliUpgradeMessageHandler({ upgradeCli }, post, () => ROOT);

    assert.strictEqual(await handler.handle({ command: "checkSquadUpdates" }), false);
    assert.ok(upgradeCli.notCalled);
    assert.deepStrictEqual(posted, []);
  });

  test("posts refreshed updates and a sanitized result on success", async () => {
    const upgradeCli = sinon.stub().resolves(squadOk(outcome()));
    const handler = new SquadCliUpgradeMessageHandler({ upgradeCli }, post, () => ROOT);

    assert.strictEqual(await handler.handle({ command: "upgradeSquadCli" }), true);

    assert.ok(upgradeCli.calledOnceWithExactly({ workspaceRoot: ROOT }));
    assert.deepStrictEqual(
      posted.map((m) => m.command),
      ["squadLoading", "squadUpdatesUpdate", "squadCliUpgradeResult", "squadLoading"]
    );
    const result = posted[2] as Extract<ExtensionMessage, { command: "squadCliUpgradeResult" }>;
    assert.deepStrictEqual(result.upgrade, {
      upgraded: true,
      previousVersion: "1.0.0",
      installedVersion: "1.2.0",
      latestVersion: "1.2.0",
      source: SquadCliSource.Global,
    });
    assert.deepStrictEqual(posted[3], { command: "squadLoading", isLoading: false });
  });

  test("surfaces failures as squadError and never posts a success result", async () => {
    const upgradeCli = sinon.stub().resolves(UPGRADE_FAILED);
    const handler = new SquadCliUpgradeMessageHandler({ upgradeCli }, post, () => ROOT);

    await handler.handle({ command: "upgradeSquadCli" });

    assert.deepStrictEqual(
      posted.map((m) => m.command),
      ["squadLoading", "squadError", "squadLoading"]
    );
    const error = posted[1] as Extract<ExtensionMessage, { command: "squadError" }>;
    assert.strictEqual(error.error.code, "upgrade-failed");
    assert.ok(error.error.remediation);
  });

  test("surfaces a declined confirmation as a cancelled squadError", async () => {
    const upgradeCli = sinon
      .stub()
      .resolves(squadErr({ code: "cancelled", message: "The Squad CLI upgrade was cancelled.", remediation: "Retry later." }));
    const handler = new SquadCliUpgradeMessageHandler({ upgradeCli }, post, () => ROOT);

    await handler.handle({ command: "upgradeSquadCli" });

    assert.ok(!posted.some((m) => m.command === "squadCliUpgradeResult"));
    const error = posted.find((m) => m.command === "squadError") as Extract<ExtensionMessage, { command: "squadError" }>;
    assert.strictEqual(error.error.code, "cancelled");
  });

  test("maps unexpected exceptions to upgrade-failed and clears loading", async () => {
    const upgradeCli = sinon.stub().rejects(new Error("boom"));
    const logger = { error: sinon.stub() };
    const handler = new SquadCliUpgradeMessageHandler({ upgradeCli }, post, () => ROOT, logger as never);

    await handler.handle({ command: "upgradeSquadCli" });

    const error = posted.find((m) => m.command === "squadError") as Extract<ExtensionMessage, { command: "squadError" }>;
    assert.strictEqual(error.error.code, "upgrade-failed");
    assert.ok(error.error.remediation);
    assert.deepStrictEqual(posted[posted.length - 1], { command: "squadLoading", isLoading: false });
    assert.ok(logger.error.calledOnce);
  });

  test("NexkitPanelMessageHandler routes upgradeSquadCli to the CLI upgrade service", async () => {
    const upgradeCli = sinon.stub().resolves(squadOk(outcome()));
    const noop = (): { dispose: () => void } => ({ dispose: () => undefined });
    const services = {
      aiTemplateData: { onDataChanged: noop, onUpdatesAvailableChanged: noop },
      profileService: { onProfilesChanged: noop },
      workspaceInitialization: { onWorkspaceInitialized: noop },
      devOpsConfig: { onConnectionsChanged: noop },
      templateMetadataScanner: { onScanProgressChanged: noop, onScanComplete: noop },
      logging: { warn: () => undefined, error: () => undefined, info: () => undefined },
      squadCliUpgrade: { upgradeCli },
    } as unknown as ServiceContainer;
    const view = {
      webview: {
        postMessage: (message: ExtensionMessage) => {
          posted.push(message);
          return Promise.resolve(true);
        },
      },
    } as unknown as vscode.WebviewView;
    const handler = new NexkitPanelMessageHandler(() => view, services);

    await handler.handleMessage({ command: "upgradeSquadCli" });

    assert.ok(upgradeCli.calledOnce);
    assert.ok(posted.some((m) => m.command === "squadCliUpgradeResult"));
  });
});

suite("Unit: runSquadCliUpgradeCommand (SQD-031)", () => {
  function fakeUi(): SquadCliUpgradeCommandUi & { info: string[]; errors: string[]; titles: string[] } {
    const token = new vscode.CancellationTokenSource().token;
    const ui = {
      info: [] as string[],
      errors: [] as string[],
      titles: [] as string[],
      async withProgress<T>(title: string, task: (t: vscode.CancellationToken) => Promise<T>): Promise<T> {
        ui.titles.push(title);
        return task(token);
      },
      async showInformation(message: string): Promise<void> {
        ui.info.push(message);
      },
      async showError(message: string): Promise<void> {
        ui.errors.push(message);
      },
    };
    return ui;
  }

  test("reports the verified upgrade and forwards the progress cancellation token", async () => {
    const upgradeCli = sinon.stub().resolves(squadOk(outcome()));
    const ui = fakeUi();

    await runSquadCliUpgradeCommand({ upgradeCli }, ROOT, ui);

    const options = upgradeCli.firstCall.args[0];
    assert.strictEqual(options.workspaceRoot, ROOT);
    assert.ok(options.token, "cancellation token forwarded");
    assert.deepStrictEqual(ui.info, ["Squad CLI upgraded from 1.0.0 to 1.2.0."]);
    assert.deepStrictEqual(ui.errors, []);
  });

  test("reports an already up-to-date CLI without claiming an upgrade", async () => {
    const ui = fakeUi();

    await runSquadCliUpgradeCommand({ upgradeCli: sinon.stub().resolves(squadOk(outcome(false))) }, ROOT, ui);

    assert.deepStrictEqual(ui.info, ["Squad CLI is already up to date (1.2.0)."]);
  });

  test("shows an actionable error and no success message on failure", async () => {
    const ui = fakeUi();

    await runSquadCliUpgradeCommand({ upgradeCli: sinon.stub().resolves(UPGRADE_FAILED) }, ROOT, ui);

    assert.deepStrictEqual(ui.info, []);
    assert.strictEqual(ui.errors.length, 1);
    assert.match(ui.errors[0], /EACCES/);
    assert.match(ui.errors[0], /npm install -g/);
  });
});
