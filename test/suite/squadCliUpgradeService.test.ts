import * as assert from "assert";
import * as vscode from "vscode";
import {
  SquadCliUpgradeConfirmationRequest,
  SquadCliUpgradeConfirmer,
  SquadCliUpgradeExecutor,
  SquadCliUpgradeService,
  SquadCliUpgradeUpdateSource,
} from "../../src/features/squad/services/squadCliUpgradeService";
import {
  SquadCliCommand,
  SquadCliExecuteOptions,
  SquadCliExecution,
  SquadCliService,
} from "../../src/features/squad/services/squadCliService";
import type {
  SquadProcessRunner,
  SquadSpawnRequest,
  SquadSpawnResult,
} from "../../src/features/squad/services/squadProcessRunner";
import {
  SquadCliSource,
  SquadInstallState,
  SquadResult,
  SquadUpdatesResult,
  SquadUpdateTarget,
  SquadUpgradeCommand,
  SquadVersionStatus,
  isSquadErr,
  isSquadOk,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

const ROOT = vscode.Uri.file("/workspace/squad");

function updates(
  cliVersion: string | null,
  latest: string | null,
  status: SquadVersionStatus,
  installed = true,
  source: SquadCliSource | undefined = SquadCliSource.Global
): SquadUpdatesResult {
  return {
    detection: {
      project: {
        installState: SquadInstallState.Installed,
        markers: {
          ".squad/config.json": true,
          ".squad/team.md": true,
          ".github/agents/squad.agent.md": true,
        },
        projectVersion: "1.0.0",
        versionStatus: SquadVersionStatus.UpToDate,
      },
      cli: { installed, source: installed ? source : undefined, cliVersion, versionStatus: status },
      detectedAt: 1,
    },
    cli: {
      target: SquadUpdateTarget.Cli,
      currentVersion: cliVersion,
      latestVersion: latest,
      status,
      updateAvailable: status === SquadVersionStatus.UpdateAvailable,
      upgradeCommand: SquadUpgradeCommand.CliSelf,
      requiresConfirmation: true,
      requiresBackup: false,
      message: "cli",
    },
    project: {
      target: SquadUpdateTarget.Project,
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
      status: SquadVersionStatus.UpToDate,
      updateAvailable: false,
      upgradeCommand: SquadUpgradeCommand.Project,
      requiresConfirmation: true,
      requiresBackup: true,
      message: "project",
    },
    checkedAt: 2,
  };
}

const OUTDATED = (): SquadUpdatesResult => updates("1.0.0", "1.2.0", SquadVersionStatus.UpdateAvailable);
const UPGRADED = (): SquadUpdatesResult => updates("1.2.0", "1.2.0", SquadVersionStatus.UpToDate);

class FakeUpdates implements SquadCliUpgradeUpdateSource {
  public calls: Array<vscode.Uri | undefined> = [];
  constructor(private readonly _results: Array<SquadResult<SquadUpdatesResult>>) {}

  public async checkUpdates(workspaceRoot?: vscode.Uri): Promise<SquadResult<SquadUpdatesResult>> {
    this.calls.push(workspaceRoot);
    const next = this._results.shift();
    if (!next) {
      throw new Error("Unexpected extra update check");
    }
    return next;
  }
}

class FakeCli implements SquadCliUpgradeExecutor {
  public calls: Array<{ command: SquadCliCommand; options?: SquadCliExecuteOptions }> = [];
  constructor(private readonly _result: () => Promise<SquadResult<SquadCliExecution>> | SquadResult<SquadCliExecution>) {}

  public async execute(command: SquadCliCommand, options?: SquadCliExecuteOptions): Promise<SquadResult<SquadCliExecution>> {
    this.calls.push({ command, options });
    return this._result();
  }
}

class FakeConfirmer implements SquadCliUpgradeConfirmer {
  public requests: SquadCliUpgradeConfirmationRequest[] = [];
  constructor(private readonly _answer: boolean) {}

  public async confirm(request: SquadCliUpgradeConfirmationRequest): Promise<boolean> {
    this.requests.push(request);
    return this._answer;
  }
}

const quietLogger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
  debug: (): void => undefined,
} as never;

function execOk(): SquadResult<SquadCliExecution> {
  return squadOk({ command: SquadCliCommand.UpgradeSelf, exitCode: 0, stdout: "upgraded", stderr: "", durationMs: 5 });
}

function build(
  results: Array<SquadResult<SquadUpdatesResult>>,
  confirm = true,
  cliResult: () => Promise<SquadResult<SquadCliExecution>> | SquadResult<SquadCliExecution> = execOk
): { service: SquadCliUpgradeService; updates: FakeUpdates; cli: FakeCli; confirmer: FakeConfirmer } {
  const updateSource = new FakeUpdates(results);
  const cli = new FakeCli(cliResult);
  const confirmer = new FakeConfirmer(confirm);
  const service = new SquadCliUpgradeService({ updates: updateSource, cli, confirmer, logger: quietLogger });
  return { service, updates: updateSource, cli, confirmer };
}

suite("SquadCliUpgradeService (SQD-031)", () => {
  test("runs `upgrade --self` only after confirmation and verifies the new version", async () => {
    const { service, updates: updateSource, cli, confirmer } = build([squadOk(OUTDATED()), squadOk(UPGRADED())]);

    const result = await service.upgradeCli({ workspaceRoot: ROOT });

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.upgraded, true);
    assert.strictEqual(result.value.previousVersion, "1.0.0");
    assert.strictEqual(result.value.installedVersion, "1.2.0");
    assert.strictEqual(result.value.latestVersion, "1.2.0");
    assert.strictEqual(result.value.source, SquadCliSource.Global);
    assert.strictEqual(result.value.updates.cli.status, SquadVersionStatus.UpToDate);
    assert.deepStrictEqual(confirmer.requests, [
      { currentVersion: "1.0.0", latestVersion: "1.2.0", source: SquadCliSource.Global },
    ]);
    assert.strictEqual(cli.calls.length, 1);
    assert.strictEqual(cli.calls[0].command, SquadCliCommand.UpgradeSelf);
    assert.strictEqual(cli.calls[0].options?.cwd, ROOT);
    assert.strictEqual(cli.calls[0].options?.source, SquadCliSource.Global);
    assert.strictEqual(cli.calls[0].options?.args, undefined);
    assert.deepStrictEqual(updateSource.calls, [ROOT, ROOT]);
  });

  test("never runs the CLI when the user declines the confirmation", async () => {
    const { service, cli, confirmer } = build([squadOk(OUTDATED())], false);

    const result = await service.upgradeCli({ workspaceRoot: ROOT });

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "cancelled");
    assert.ok(result.error.remediation);
    assert.strictEqual(confirmer.requests.length, 1);
    assert.strictEqual(cli.calls.length, 0);
  });

  test("reports up to date without prompting or executing when no update is available", async () => {
    const { service, cli, confirmer } = build([squadOk(UPGRADED())]);

    const result = await service.upgradeCli();

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.upgraded, false);
    assert.strictEqual(result.value.installedVersion, "1.2.0");
    assert.strictEqual(confirmer.requests.length, 0);
    assert.strictEqual(cli.calls.length, 0);
  });

  test("returns cli-not-found with install remediation when the CLI is missing", async () => {
    const { service, cli, confirmer } = build([squadOk(updates(null, "1.2.0", SquadVersionStatus.Unknown, false))]);

    const result = await service.upgradeCli();

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "cli-not-found");
    assert.match(result.error.remediation ?? "", /npm install -g @bradygaster\/squad-cli@latest/);
    assert.strictEqual(confirmer.requests.length, 0);
    assert.strictEqual(cli.calls.length, 0);
  });

  test("returns version-unknown when upgrade availability cannot be determined", async () => {
    const { service, cli, confirmer } = build([squadOk(updates("source", "1.2.0", SquadVersionStatus.Unknown))]);

    const result = await service.upgradeCli();

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "version-unknown");
    assert.ok(result.error.remediation);
    assert.strictEqual(confirmer.requests.length, 0);
    assert.strictEqual(cli.calls.length, 0);
  });

  test("propagates update-check failures without prompting", async () => {
    const failure = squadErr({
      code: "update-check-failed",
      message: "The latest Squad version could not be checked.",
      remediation: "Verify network access.",
    });
    const { service, cli, confirmer } = build([failure]);

    const result = await service.upgradeCli();

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "update-check-failed");
    assert.strictEqual(confirmer.requests.length, 0);
    assert.strictEqual(cli.calls.length, 0);
  });

  test("maps a non-zero CLI exit to an actionable upgrade-failed error", async () => {
    const { service, updates: updateSource } = build([squadOk(OUTDATED())], true, () =>
      squadErr({
        code: "cli-execution-failed",
        message: 'The Squad "upgrade-self" command failed: EACCES permission denied',
        remediation: "Review the command output.",
        detail: "exitCode=1",
      })
    );

    const result = await service.upgradeCli();

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "upgrade-failed");
    assert.strictEqual(result.error.message, "The Squad CLI upgrade failed: EACCES permission denied");
    assert.match(result.error.remediation ?? "", /npm install -g/);
    assert.strictEqual(result.error.detail, "exitCode=1");
    assert.strictEqual(updateSource.calls.length, 1, "no verification after a failed upgrade");
  });

  test("preserves timeout and cancellation errors and forwards the cancellation token", async () => {
    const token = new vscode.CancellationTokenSource().token;
    for (const code of ["cli-timeout", "cancelled"] as const) {
      const { service, cli } = build([squadOk(OUTDATED())], true, () =>
        squadErr({ code, message: `Squad ${code}`, remediation: "Retry." })
      );

      const result = await service.upgradeCli({ token });

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, code);
      assert.strictEqual(cli.calls[0].options?.token, token);
    }
  });

  test("fails when the upgrade command succeeds but the version did not change", async () => {
    const { service } = build([squadOk(OUTDATED()), squadOk(OUTDATED())]);

    const result = await service.upgradeCli();

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "upgrade-failed");
    assert.match(result.error.message, /did not take effect/);
    assert.match(result.error.detail ?? "", /previous=1\.0\.0 installed=1\.0\.0 target=1\.2\.0/);
    assert.ok(result.error.remediation);
  });

  test("fails when the post-upgrade verification cannot run", async () => {
    const { service } = build([squadOk(OUTDATED()), squadErr({ code: "detection-failed", message: "Detection failed." })]);

    const result = await service.upgradeCli();

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "upgrade-failed");
    assert.strictEqual(result.error.detail, "detection-failed");
  });

  test("rejects a concurrent upgrade while one is running", async () => {
    let release: (value: SquadResult<SquadCliExecution>) => void = () => undefined;
    const pending = new Promise<SquadResult<SquadCliExecution>>((resolve) => (release = resolve));
    const { service, cli } = build([squadOk(OUTDATED()), squadOk(UPGRADED())], true, () => pending);

    const first = service.upgradeCli();
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(service.isUpgrading, true);

    const second = await service.upgradeCli();
    assert.ok(isSquadErr(second));
    assert.strictEqual(second.error.code, "upgrade-failed");
    assert.match(second.error.message, /already in progress/);

    release(execOk());
    const firstResult = await first;
    assert.ok(isSquadOk(firstResult));
    assert.strictEqual(cli.calls.length, 1);
    assert.strictEqual(service.isUpgrading, false);
  });

  test("spawns the allowlisted `upgrade --self` argv through SquadCliService (mocked process)", async () => {
    const spawned: SquadSpawnRequest[] = [];
    const runner: SquadProcessRunner = {
      async run(request: SquadSpawnRequest): Promise<SquadSpawnResult> {
        spawned.push(request);
        return { stdout: "ok", stderr: "", exitCode: 0, timedOut: false, cancelled: false };
      },
    };
    const cli = new SquadCliService({ runner, cliSource: SquadCliSource.Npx, logger: quietLogger });
    const service = new SquadCliUpgradeService({
      updates: new FakeUpdates([squadOk(OUTDATED()), squadOk(UPGRADED())]),
      cli,
      confirmer: new FakeConfirmer(true),
      logger: quietLogger,
    });

    const result = await service.upgradeCli({ workspaceRoot: ROOT });

    assert.ok(isSquadOk(result));
    assert.strictEqual(spawned.length, 1);
    assert.strictEqual(spawned[0].command, "squad", "detected global source overrides the configured npx source");
    assert.deepStrictEqual(spawned[0].args, ["upgrade", "--self"]);
    assert.strictEqual(spawned[0].cwd, ROOT.fsPath);
    assert.strictEqual(spawned[0].timeoutMs, 120_000);
  });
});
