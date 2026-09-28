import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  SquadDetectionResult,
  SquadInstallState,
  SquadUpdatesResult,
  SquadUpdateTarget,
  SquadUpgradeCommand,
  SquadVersionStatus,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";
import { SquadCliCommand } from "../../src/features/squad/services/squadCliService";
import { SquadArtifactBackup } from "../../src/features/squad/services/squadInitService";
import {
  SquadProjectUpgradeConfirmer,
  SquadProjectUpgradeService,
} from "../../src/features/squad/services/squadProjectUpgradeService";
import { LoggingService } from "../../src/shared/services/loggingService";

const WORKSPACE = vscode.Uri.file(process.platform === "win32" ? "C:\\ws" : "/ws");
const BACKUP_PATH = process.platform === "win32" ? "C:\\backups\\squad-1" : "/backups/squad-1";

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as LoggingService;

function detection(projectVersion: string | null, installState: SquadInstallState = SquadInstallState.Installed): SquadDetectionResult {
  return {
    project: {
      installState,
      markers: {
        ".squad/config.json": installState !== SquadInstallState.NotInstalled,
        ".squad/team.md": installState !== SquadInstallState.NotInstalled,
        ".github/agents/squad.agent.md": installState !== SquadInstallState.NotInstalled,
      },
      projectVersion,
      versionStatus: SquadVersionStatus.Unknown,
    },
    cli: { installed: true, source: "global", cliVersion: "1.2.0", versionStatus: SquadVersionStatus.UpToDate },
    detectedAt: 0,
  };
}

function updates(
  status: SquadVersionStatus,
  currentVersion: string | null = "1.0.0",
  installState: SquadInstallState = SquadInstallState.Installed
): SquadUpdatesResult {
  const det = detection(currentVersion, installState);
  det.project.versionStatus = status;
  return {
    detection: det,
    cli: {
      target: SquadUpdateTarget.Cli,
      currentVersion: "1.2.0",
      latestVersion: "1.2.0",
      status: SquadVersionStatus.UpToDate,
      updateAvailable: false,
      upgradeCommand: SquadUpgradeCommand.CliSelf,
      requiresConfirmation: true,
      requiresBackup: false,
      message: "",
    },
    project: {
      target: SquadUpdateTarget.Project,
      currentVersion,
      latestVersion: "1.2.0",
      status,
      updateAvailable: status === SquadVersionStatus.UpdateAvailable,
      upgradeCommand: SquadUpgradeCommand.Project,
      requiresConfirmation: true,
      requiresBackup: true,
      message: "",
    },
    checkedAt: 1,
  };
}

interface Harness {
  service: SquadProjectUpgradeService;
  order: string[];
  checkUpdates: sinon.SinonStub;
  execute: sinon.SinonStub;
  backupSquadArtifacts: sinon.SinonStub;
  restoreSquadArtifacts: sinon.SinonStub;
  detect: sinon.SinonStub;
  confirm: sinon.SinonStub;
}

function createHarness(options: { workspace?: vscode.Uri | null; status?: SquadVersionStatus } = {}): Harness {
  const order: string[] = [];
  const checkUpdates = sinon.stub().callsFake(async () => {
    order.push("check");
    return squadOk(updates(options.status ?? SquadVersionStatus.UpdateAvailable));
  });
  const confirm = sinon.stub().callsFake(async () => {
    order.push("confirm");
    return true;
  });
  const backupSquadArtifacts = sinon.stub().callsFake(async () => {
    order.push("backup");
    return BACKUP_PATH;
  });
  const restoreSquadArtifacts = sinon.stub().callsFake(async () => {
    order.push("restore");
  });
  const execute = sinon.stub().callsFake(async (command: SquadCliCommand) => {
    order.push(`cli:${command}`);
    return squadOk({ command, exitCode: 0, stdout: "", stderr: "" });
  });
  const detect = sinon.stub().callsFake(async () => {
    order.push("detect");
    return squadOk(detection("1.2.0"));
  });

  const backup: SquadArtifactBackup = { backupSquadArtifacts, restoreSquadArtifacts };
  const confirmer: SquadProjectUpgradeConfirmer = { confirm };
  const workspace = options.workspace === null ? undefined : (options.workspace ?? WORKSPACE);

  const service = new SquadProjectUpgradeService({
    updates: { checkUpdates },
    cli: { execute },
    backup,
    detection: { detect },
    confirmer,
    logger: silentLogger,
    getWorkspaceRoot: () => workspace,
  });

  return { service, order, checkUpdates, execute, backupSquadArtifacts, restoreSquadArtifacts, detect, confirm };
}

suite("Unit: SquadProjectUpgradeService (SQD-032)", () => {
  test("Should confirm, back up, then run `squad upgrade --force` in the workspace (FR-005/FR-006)", async () => {
    const h = createHarness();

    const result = await h.service.upgradeProject();

    assert.ok(result.ok, "expected a successful upgrade");
    assert.deepStrictEqual(h.order, ["check", "confirm", "backup", `cli:${SquadCliCommand.Upgrade}`, "detect"]);
    const [command, cliOptions] = h.execute.firstCall.args;
    assert.strictEqual(command, SquadCliCommand.Upgrade);
    assert.deepStrictEqual(cliOptions.args, ["--force"]);
    assert.strictEqual(cliOptions.cwd.fsPath, WORKSPACE.fsPath);
    assert.strictEqual(h.backupSquadArtifacts.firstCall.args[0], WORKSPACE.fsPath);
    if (result.ok) {
      assert.strictEqual(result.value.upgraded, true);
      assert.strictEqual(result.value.previousVersion, "1.0.0");
      assert.strictEqual(result.value.targetVersion, "1.2.0");
      assert.strictEqual(result.value.currentVersion, "1.2.0");
      assert.strictEqual(result.value.backupPath, BACKUP_PATH);
      assert.strictEqual(result.value.detection?.project.projectVersion, "1.2.0");
    }
  });

  test("Should pass the current/latest versions to the confirmation dialog", async () => {
    const h = createHarness();

    await h.service.upgradeProject();

    const request = h.confirm.firstCall.args[0];
    assert.strictEqual(request.currentVersion, "1.0.0");
    assert.strictEqual(request.latestVersion, "1.2.0");
    assert.strictEqual(request.status, SquadVersionStatus.UpdateAvailable);
    assert.strictEqual(request.workspaceRoot, WORKSPACE.fsPath);
  });

  test("Should forward the cancellation token to the CLI", async () => {
    const h = createHarness();
    const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) };

    await h.service.upgradeProject({ token: token as unknown as vscode.CancellationToken });

    assert.strictEqual(h.execute.firstCall.args[1].token, token);
  });

  test("Should return cancelled without backup or CLI when the user declines", async () => {
    const h = createHarness();
    h.confirm.resolves(false);

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cancelled");
      assert.ok(result.error.remediation);
    }
    assert.ok(h.backupSquadArtifacts.notCalled, "no backup when declined");
    assert.ok(h.execute.notCalled, "never runs `squad upgrade` without confirmation");
  });

  test("Should abort before the CLI when the backup fails", async () => {
    const h = createHarness();
    h.backupSquadArtifacts.rejects(new Error("disk full"));

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backup-failed");
      assert.strictEqual(result.error.detail, "disk full");
      assert.ok(result.error.remediation);
    }
    assert.ok(h.execute.notCalled, "never upgrades without a backup");
  });

  test("Should abort before the CLI when the backup captured nothing", async () => {
    const h = createHarness();
    h.backupSquadArtifacts.resolves(null);

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backup-failed");
    }
    assert.ok(h.execute.notCalled);
  });

  test("Should restore the backup and surface the CLI error when the upgrade fails", async () => {
    const h = createHarness();
    h.execute.callsFake(async (command: SquadCliCommand) => {
      h.order.push(`cli:${command}`);
      return squadErr({ code: "cli-execution-failed", message: "exit 1", remediation: "Check the CLI output.", detail: "boom" });
    });

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cli-execution-failed");
      assert.match(result.error.message, /restored from the backup/);
      assert.strictEqual(result.error.remediation, "Check the CLI output.");
      assert.strictEqual(result.error.detail, "boom");
    }
    assert.deepStrictEqual(h.order, ["check", "confirm", "backup", `cli:${SquadCliCommand.Upgrade}`, "restore"]);
    assert.deepStrictEqual(h.restoreSquadArtifacts.firstCall.args, [WORKSPACE.fsPath, BACKUP_PATH]);
    assert.ok(h.detect.notCalled, "a failed upgrade never produces a refreshed success state");
  });

  test("Should restore the backup on timeout", async () => {
    const h = createHarness();
    h.execute.resolves(squadErr({ code: "cli-timeout", message: "timed out" }));

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cli-timeout");
      assert.ok(result.error.remediation, "a fallback remediation is always provided");
    }
    assert.ok(h.restoreSquadArtifacts.calledOnce);
  });

  test("Should report manual-restore guidance when the automatic restore fails", async () => {
    const h = createHarness();
    h.execute.resolves(squadErr({ code: "cli-execution-failed", message: "exit 1" }));
    h.restoreSquadArtifacts.rejects(new Error("locked"));

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cli-execution-failed");
      assert.match(result.error.message, /could not be restored automatically/);
      assert.match(result.error.remediation ?? "", /manually/);
    }
  });

  test("Should not restore when the CLI is missing (nothing changed)", async () => {
    const h = createHarness();
    h.execute.resolves(squadErr({ code: "cli-not-found", message: "Squad CLI not found.", remediation: "Install it." }));

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cli-not-found");
      assert.match(result.error.message, /no files were changed/);
      assert.strictEqual(result.error.remediation, "Install it.");
    }
    assert.ok(h.restoreSquadArtifacts.notCalled);
  });

  test("Should report up-to-date without confirmation, backup or CLI", async () => {
    const h = createHarness({ status: SquadVersionStatus.UpToDate });

    const result = await h.service.upgradeProject();

    assert.ok(result.ok);
    if (result.ok) {
      assert.strictEqual(result.value.upgraded, false);
      assert.strictEqual(result.value.backupPath, null);
    }
    assert.ok(h.confirm.notCalled);
    assert.ok(h.backupSquadArtifacts.notCalled);
    assert.ok(h.execute.notCalled);
  });

  test("Should still require confirmation and backup when the version status is unknown", async () => {
    const h = createHarness({ status: SquadVersionStatus.Unknown });

    const result = await h.service.upgradeProject();

    assert.ok(result.ok);
    assert.strictEqual(h.confirm.firstCall.args[0].status, SquadVersionStatus.Unknown);
    assert.ok(h.backupSquadArtifacts.calledBefore(h.execute));
  });

  test("Should refuse when no Squad project is installed", async () => {
    const h = createHarness();
    h.checkUpdates.resolves(squadOk(updates(SquadVersionStatus.Unknown, null, SquadInstallState.NotInstalled)));

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "detection-failed");
      assert.ok(result.error.remediation);
    }
    assert.ok(h.confirm.notCalled);
    assert.ok(h.execute.notCalled);
  });

  test("Should propagate update-check failures without prompting", async () => {
    const h = createHarness();
    h.checkUpdates.resolves(squadErr({ code: "update-check-failed", message: "offline", remediation: "Retry." }));

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "update-check-failed");
    }
    assert.ok(h.confirm.notCalled);
    assert.ok(h.execute.notCalled);
  });

  test("Should fail with not-a-workspace when no folder is open", async () => {
    const h = createHarness({ workspace: null });

    const result = await h.service.upgradeProject();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "not-a-workspace");
    }
    assert.ok(h.checkUpdates.notCalled);
  });

  test("Should still succeed when post-upgrade detection fails", async () => {
    const h = createHarness();
    h.detect.resolves(squadErr({ code: "detection-failed", message: "nope" }));

    const result = await h.service.upgradeProject();

    assert.ok(result.ok);
    if (result.ok) {
      assert.strictEqual(result.value.upgraded, true);
      assert.strictEqual(result.value.currentVersion, null);
      assert.strictEqual(result.value.detection, undefined);
    }
  });
});
