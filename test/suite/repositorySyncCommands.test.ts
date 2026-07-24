import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { SettingsManager } from "../../src/core/settingsManager";
import { registerRunRepositorySyncCommand, registerToggleRepositorySyncCommand } from "../../src/features/repository-sync/commands";
import { Commands } from "../../src/shared/constants/commands";

suite("Unit: Repository Sync Commands", () => {
  test("run once command triggers scheduler and updates status bar", async () => {
    const runSync = sinon.stub().resolves({
      startedAt: 1,
      completedAt: 2,
      repositoryCount: 1,
      results: [],
    });
    const updateLastRun = sinon.stub();

    const telemetry = {
      trackCommandExecution: async (_commandId: string, callback: () => Promise<void>): Promise<void> => callback(),
    };
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    const services = {
      repositorySyncScheduler: { runSync },
      repositorySyncStatusBar: { updateLastRun },
      telemetry,
    } as unknown as ServiceContainer;

    const infoStub = sinon.stub(vscode.window, "showInformationMessage").resolves(undefined);

    registerRunRepositorySyncCommand(context, services);
    await vscode.commands.executeCommand(Commands.REPOSITORY_SYNC_RUN_ONCE);

    assert.ok(runSync.calledOnce);
    assert.ok(updateLastRun.calledOnce);

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
