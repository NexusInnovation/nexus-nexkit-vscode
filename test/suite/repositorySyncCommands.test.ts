import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { SettingsManager } from "../../src/core/settingsManager";
import {
  registerRetryFailedRepositorySyncCommand,
  registerRunRepositorySyncCommand,
  registerShowRepositorySyncOutputCommand,
  registerToggleRepositorySyncCommand,
} from "../../src/features/repository-sync/commands";
import { Commands } from "../../src/shared/constants/commands";

suite("Unit: Repository Sync Commands", () => {
  test("run once command triggers scheduler and updates status bar", async () => {
    const runSync = sinon.stub().resolves({
      startedAt: 1,
      completedAt: 2,
      repositoryCount: 1,
      plannedCount: 1,
      processedCount: 1,
      results: [],
      summary: {
        total: 1,
        successReady: 1,
        skipped: 0,
        conflictRisk: 0,
        failed: 0,
        changed: 0,
      },
    });
    const outputAppendLine = sinon.stub();
    const outputAppendBlock = sinon.stub();
    const outputShow = sinon.stub();
    const updateLastRun = sinon.stub();
    const setRunning = sinon.stub();

    const telemetry = {
      trackCommandExecution: async (_commandId: string, callback: () => Promise<void>): Promise<void> => callback(),
    };
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    const services = {
      repositorySyncScheduler: { runSync },
      repositorySyncStatusBar: { setRunning, updateLastRun },
      repositorySyncOutput: { appendLine: outputAppendLine, appendBlock: outputAppendBlock, show: outputShow },
      telemetry,
    } as unknown as ServiceContainer;

    function fakeShowQuickPick(
      items: readonly string[] | Thenable<readonly string[]>,
      options?: vscode.QuickPickOptions
    ): Thenable<string | undefined>;
    function fakeShowQuickPick<T extends vscode.QuickPickItem>(
      items: readonly T[] | Thenable<readonly T[]>,
      options?: vscode.QuickPickOptions
    ): Thenable<T | undefined>;
    function fakeShowQuickPick(): Thenable<unknown> {
      return Promise.resolve("Run Full Sync");
    }

    const quickPickStub = sinon.stub(vscode.window, "showQuickPick").callsFake(fakeShowQuickPick);
    const infoStub = sinon.stub(vscode.window, "showInformationMessage").resolves(undefined);

    registerRunRepositorySyncCommand(context, services);
    await vscode.commands.executeCommand(Commands.REPOSITORY_SYNC_RUN_ONCE);

    assert.ok(setRunning.calledOnce);
    assert.ok(runSync.calledOnceWith({ retryFailedOnly: false, interactiveTrust: true, triggerReason: "manual-full-sync" }));
    assert.ok(updateLastRun.calledOnce);
    assert.ok(outputAppendBlock.calledOnce);

    quickPickStub.restore();
    infoStub.restore();
    context.subscriptions.forEach((disposable) => disposable.dispose());
  });

  test("run once command routes workspace conflict action to open scm", async () => {
    const runSync = sinon.stub().resolves({
      startedAt: 1,
      completedAt: 2,
      repositoryCount: 1,
      plannedCount: 1,
      processedCount: 1,
      results: [
        {
          repository: {
            key: "repo-1",
            name: "Repo 1",
            path: "C:/repo-1",
            source: "workspace",
            isExternal: false,
          },
          outcome: {
            kind: "conflict-risk",
            reason: "Working tree has uncommitted changes.",
            conflictActionGroup: "workspace-conflict",
            actions: ["open-workspace-scm", "retry"],
          },
          success: false,
          changed: false,
          skipped: false,
        },
      ],
      summary: {
        total: 1,
        successReady: 0,
        skipped: 0,
        conflictRisk: 1,
        failed: 0,
        changed: 0,
      },
    });

    const executeCommandStub = sinon.stub(vscode.commands, "executeCommand").resolves(undefined as never);
    const infoStub = sinon.stub(vscode.window, "showInformationMessage").resolves(undefined);
    const outputAppendLine = sinon.stub();
    const outputAppendBlock = sinon.stub();

    const telemetry = {
      trackCommandExecution: async (_commandId: string, callback: () => Promise<void>): Promise<void> => callback(),
    };
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    const services = {
      repositorySyncScheduler: { runSync },
      repositorySyncStatusBar: { setRunning: sinon.stub(), updateLastRun: sinon.stub() },
      repositorySyncOutput: { appendLine: outputAppendLine, appendBlock: outputAppendBlock, show: sinon.stub() },
      telemetry,
    } as unknown as ServiceContainer;

    function fakeShowQuickPick(
      items: readonly string[] | Thenable<readonly string[]>,
      options?: vscode.QuickPickOptions
    ): Thenable<string | undefined>;
    function fakeShowQuickPick<T extends vscode.QuickPickItem>(
      items: readonly T[] | Thenable<readonly T[]>,
      options?: vscode.QuickPickOptions
    ): Thenable<T | undefined>;
    function fakeShowQuickPick(items: readonly unknown[] | Thenable<readonly unknown[]>): Thenable<unknown> {
      const resolvedItems = items as readonly unknown[];
      if (resolvedItems.length > 0 && typeof resolvedItems[0] === "string") {
        return Promise.resolve("Run Full Sync");
      }

      return Promise.resolve(
        (resolvedItems as Array<{ detail?: string }>).find((item) => item.detail === "open-workspace-scm")
      );
    }

    const quickPickStub = sinon.stub(vscode.window, "showQuickPick").callsFake(fakeShowQuickPick);

    registerRunRepositorySyncCommand(context, services);
    await vscode.commands.executeCommand(Commands.REPOSITORY_SYNC_RUN_ONCE);

    assert.ok(executeCommandStub.calledWith("workbench.view.scm"));
    assert.ok(outputAppendBlock.called);

    quickPickStub.restore();
    infoStub.restore();
    executeCommandStub.restore();
    context.subscriptions.forEach((disposable) => disposable.dispose());
  });

  test("run once command routes external conflict action to openFolder in new window", async () => {
    const runSync = sinon.stub().resolves({
      startedAt: 1,
      completedAt: 2,
      repositoryCount: 1,
      plannedCount: 1,
      processedCount: 1,
      results: [
        {
          repository: {
            key: "repo-2",
            name: "External Repo",
            path: "C:/external-repo",
            source: "external",
            isExternal: true,
          },
          outcome: {
            kind: "conflict-risk",
            reason: "Local branch is ahead of upstream.",
            conflictActionGroup: "external-conflict",
            actions: ["open-external-repo", "ignore", "retry", "retry-failed-only"],
          },
          success: false,
          changed: false,
          skipped: false,
        },
      ],
      summary: {
        total: 1,
        successReady: 0,
        skipped: 0,
        conflictRisk: 1,
        failed: 0,
        changed: 0,
      },
    });

    const executeCommandStub = sinon.stub(vscode.commands, "executeCommand").resolves(undefined as never);
    const infoStub = sinon.stub(vscode.window, "showInformationMessage").resolves(undefined);
    const outputAppendLine = sinon.stub();
    const outputAppendBlock = sinon.stub();

    const telemetry = {
      trackCommandExecution: async (_commandId: string, callback: () => Promise<void>): Promise<void> => callback(),
    };
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    const services = {
      repositorySyncScheduler: { runSync },
      repositorySyncStatusBar: { setRunning: sinon.stub(), updateLastRun: sinon.stub() },
      repositorySyncOutput: { appendLine: outputAppendLine, appendBlock: outputAppendBlock, show: sinon.stub() },
      telemetry,
    } as unknown as ServiceContainer;

    function fakeShowQuickPick(
      items: readonly string[] | Thenable<readonly string[]>,
      options?: vscode.QuickPickOptions
    ): Thenable<string | undefined>;
    function fakeShowQuickPick<T extends vscode.QuickPickItem>(
      items: readonly T[] | Thenable<readonly T[]>,
      options?: vscode.QuickPickOptions
    ): Thenable<T | undefined>;
    function fakeShowQuickPick(items: readonly unknown[] | Thenable<readonly unknown[]>): Thenable<unknown> {
      const resolvedItems = items as readonly unknown[];
      if (resolvedItems.length > 0 && typeof resolvedItems[0] === "string") {
        return Promise.resolve("Run Full Sync");
      }

      return Promise.resolve(
        (resolvedItems as Array<{ detail?: string }>).find((item) => item.detail === "open-external-repo")
      );
    }

    const quickPickStub = sinon.stub(vscode.window, "showQuickPick").callsFake(fakeShowQuickPick);

    registerRunRepositorySyncCommand(context, services);
    await vscode.commands.executeCommand(Commands.REPOSITORY_SYNC_RUN_ONCE);

    assert.ok(executeCommandStub.calledWith("vscode.openFolder", sinon.match.any, true));
    assert.ok(outputAppendBlock.called);

    quickPickStub.restore();
    infoStub.restore();
    executeCommandStub.restore();
    context.subscriptions.forEach((disposable) => disposable.dispose());
  });

  test("retry failed-only command executes scheduler with retry flag", async () => {
    const runSync = sinon.stub().resolves({
      startedAt: 1,
      completedAt: 2,
      repositoryCount: 2,
      plannedCount: 2,
      processedCount: 1,
      results: [],
      summary: {
        total: 1,
        successReady: 1,
        skipped: 0,
        conflictRisk: 0,
        failed: 0,
        changed: 1,
      },
    });

    const telemetry = {
      trackCommandExecution: async (_commandId: string, callback: () => Promise<void>): Promise<void> => callback(),
    };
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    const services = {
      repositorySyncScheduler: { runSync },
      repositorySyncStatusBar: { setRunning: sinon.stub(), updateLastRun: sinon.stub() },
      repositorySyncOutput: { appendLine: sinon.stub(), appendBlock: sinon.stub(), show: sinon.stub() },
      telemetry,
    } as unknown as ServiceContainer;
    const infoStub = sinon.stub(vscode.window, "showInformationMessage").resolves(undefined);

    registerRetryFailedRepositorySyncCommand(context, services);
    await vscode.commands.executeCommand(Commands.REPOSITORY_SYNC_RETRY_FAILED_ONLY);

    assert.ok(
      runSync.calledOnceWith({
        retryFailedOnly: true,
        interactiveTrust: true,
        triggerReason: "manual-retry-failed-command",
      })
    );

    infoStub.restore();
    context.subscriptions.forEach((disposable) => disposable.dispose());
  });

  test("show output command opens repository sync output channel", async () => {
    const outputShow = sinon.stub();
    const telemetry = {
      trackCommandExecution: async (_commandId: string, callback: () => Promise<void>): Promise<void> => callback(),
    };
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    const services = {
      repositorySyncOutput: { show: outputShow },
      telemetry,
    } as unknown as ServiceContainer;

    registerShowRepositorySyncOutputCommand(context, services);
    await vscode.commands.executeCommand(Commands.REPOSITORY_SYNC_SHOW_OUTPUT);

    assert.ok(outputShow.calledOnceWithExactly());
    context.subscriptions.forEach((disposable) => disposable.dispose());
  });

  test("summary output includes command IDs for next actions when conflict risk exists", async () => {
    const runSync = sinon.stub().resolves({
      startedAt: 1,
      completedAt: 2,
      repositoryCount: 1,
      plannedCount: 1,
      processedCount: 1,
      results: [
        {
          repository: {
            key: "repo-3",
            name: "Repo 3",
            path: "C:/repo-3",
            source: "workspace",
            isExternal: false,
          },
          outcome: {
            kind: "conflict-risk",
            reason: "Diverged",
            conflictActionGroup: "workspace-conflict",
            actions: ["open-workspace-scm", "retry"],
          },
          success: false,
          changed: false,
          skipped: false,
        },
      ],
      summary: {
        total: 1,
        successReady: 0,
        skipped: 0,
        conflictRisk: 1,
        failed: 0,
        changed: 0,
      },
    });

    const outputAppendBlock = sinon.stub();
    const telemetry = {
      trackCommandExecution: async (_commandId: string, callback: () => Promise<void>): Promise<void> => callback(),
    };
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    const services = {
      repositorySyncScheduler: { runSync },
      repositorySyncStatusBar: { setRunning: sinon.stub(), updateLastRun: sinon.stub() },
      repositorySyncOutput: { appendLine: sinon.stub(), appendBlock: outputAppendBlock, show: sinon.stub() },
      telemetry,
    } as unknown as ServiceContainer;

    function fakeShowQuickPick(
      items: readonly string[] | Thenable<readonly string[]>,
      options?: vscode.QuickPickOptions
    ): Thenable<string | undefined>;
    function fakeShowQuickPick<T extends vscode.QuickPickItem>(
      items: readonly T[] | Thenable<readonly T[]>,
      options?: vscode.QuickPickOptions
    ): Thenable<T | undefined>;
    function fakeShowQuickPick(items: readonly unknown[] | Thenable<readonly unknown[]>): Thenable<unknown> {
      const resolvedItems = items as readonly unknown[];
      if (resolvedItems.length > 0 && typeof resolvedItems[0] === "string") {
        return Promise.resolve("Run Full Sync");
      }

      return Promise.resolve(undefined);
    }

    const quickPickStub = sinon.stub(vscode.window, "showQuickPick").callsFake(fakeShowQuickPick);
    const infoStub = sinon.stub(vscode.window, "showInformationMessage").resolves(undefined);

    registerRunRepositorySyncCommand(context, services);
    await vscode.commands.executeCommand(Commands.REPOSITORY_SYNC_RUN_ONCE);

    const lines = outputAppendBlock.firstCall.args[0] as string[];
    assert.ok(lines.some((line) => line.includes(Commands.REPOSITORY_SYNC_RETRY_FAILED_ONLY)));
    assert.ok(lines.some((line) => line.includes(Commands.REPOSITORY_SYNC_SHOW_OUTPUT)));

    quickPickStub.restore();
    infoStub.restore();
    context.subscriptions.forEach((disposable) => disposable.dispose());
  });

  test("toggle command enables scheduler and shows status bar", async () => {
    const setEnabled = sinon.stub().resolves();
    const start = sinon.stub();
    const show = sinon.stub();

    const telemetry = {
      trackCommandExecution: async (_commandId: string, callback: () => Promise<void>): Promise<void> => callback(),
    };
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    const services = {
      repositorySyncScheduler: { start, stop: sinon.stub() },
      repositorySyncStatusBar: { show, hide: sinon.stub() },
      telemetry,
    } as unknown as ServiceContainer;

    const enabledStub = sinon.stub(SettingsManager, "isRepoSyncEnabled").returns(false);
    const setEnabledStub = sinon.stub(SettingsManager, "setRepoSyncEnabled").callsFake(setEnabled);
    const statusBarEnabledStub = sinon.stub(SettingsManager, "isRepoSyncStatusBarEnabled").returns(true);
    const infoStub = sinon.stub(vscode.window, "showInformationMessage").resolves(undefined);

    registerToggleRepositorySyncCommand(context, services);
    await vscode.commands.executeCommand(Commands.REPOSITORY_SYNC_TOGGLE);

    assert.ok(setEnabledStub.calledOnceWith(true));
    assert.ok(start.calledOnce);
    assert.ok(show.calledOnce);

    infoStub.restore();
    statusBarEnabledStub.restore();
    setEnabledStub.restore();
    enabledStub.restore();
    context.subscriptions.forEach((disposable) => disposable.dispose());
  });
});
