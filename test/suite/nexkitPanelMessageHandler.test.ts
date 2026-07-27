import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { NexkitPanelMessageHandler } from "../../src/features/panel-ui/nexkitPanelMessageHandler";
import { Commands } from "../../src/shared/constants/commands";

function createServices(): ServiceContainer {
  return {
    aiTemplateData: {
      onDataChanged: () => ({ dispose: () => undefined }),
      onUpdatesAvailableChanged: () => ({ dispose: () => undefined }),
    },
    profileService: {
      onProfilesChanged: () => ({ dispose: () => undefined }),
    },
    workspaceInitialization: {
      onWorkspaceInitialized: () => ({ dispose: () => undefined }),
    },
    devOpsConfig: {
      onConnectionsChanged: () => ({ dispose: () => undefined }),
    },
    templateMetadataScanner: {
      onScanProgressChanged: () => ({ dispose: () => undefined }),
      onScanComplete: () => ({ dispose: () => undefined }),
    },
    telemetry: {
      trackEvent: () => undefined,
    },
    repositorySyncOutput: {
      appendLine: () => undefined,
    },
    repositoryDiscovery: {
      getSyncableRepositories: async () => [],
    },
  } as unknown as ServiceContainer;
}

suite("Unit: NexkitPanelMessageHandler", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("opens the Convert to Markdown panel from the webview", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    const handler = new NexkitPanelMessageHandler(() => undefined, createServices());

    await handler.handleMessage({ command: "openConvertToMarkdown" });

    assert.ok(executeCommand.calledOnceWithExactly(Commands.OPEN_CONVERT_TO_MARKDOWN));
  });

  test("routes repository sync retry failed-only from webview", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    const handler = new NexkitPanelMessageHandler(() => undefined, createServices());

    await handler.handleMessage({ command: "repositorySyncRetryFailedOnly" });

    assert.ok(executeCommand.calledOnceWithExactly(Commands.REPOSITORY_SYNC_RETRY_FAILED_ONLY));
  });

  test("routes repository sync run once from webview", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    const postMessage = sandbox.stub().returns(true);
    const handler = new NexkitPanelMessageHandler(
      () => ({ webview: { postMessage } } as unknown as vscode.WebviewView),
      createServices()
    );

    await handler.handleMessage({ command: "repositorySyncRunOnce" });

    assert.ok(executeCommand.calledOnceWithExactly(Commands.REPOSITORY_SYNC_RUN_ONCE));
    assert.ok(postMessage.calledOnce);
    assert.strictEqual(postMessage.firstCall.args[0].command, "repositorySyncActionFeedback");
    assert.strictEqual(postMessage.firstCall.args[0].feedback.actionType, "run-once");
    assert.strictEqual(postMessage.firstCall.args[0].feedback.level, "info");
    assert.ok(typeof postMessage.firstCall.args[0].feedback.timestamp === "string");
  });

  test("sends repository sync error feedback when run once command fails", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").rejects(new Error("sync failed"));
    const postMessage = sandbox.stub().returns(true);
    const handler = new NexkitPanelMessageHandler(
      () => ({ webview: { postMessage } } as unknown as vscode.WebviewView),
      createServices()
    );

    await assert.rejects(async () => {
      await handler.handleMessage({ command: "repositorySyncRunOnce" });
    });

    assert.ok(executeCommand.calledOnceWithExactly(Commands.REPOSITORY_SYNC_RUN_ONCE));
    assert.ok(postMessage.calledOnce);
    assert.strictEqual(postMessage.firstCall.args[0].command, "repositorySyncActionFeedback");
    assert.strictEqual(postMessage.firstCall.args[0].feedback.actionType, "run-once");
    assert.strictEqual(postMessage.firstCall.args[0].feedback.level, "error");
    assert.strictEqual(postMessage.firstCall.args[0].feedback.message, "Failed to run repository sync.");
  });

  test("routes repository sync retry specific from webview", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    const handler = new NexkitPanelMessageHandler(() => undefined, createServices());

    await handler.handleMessage({
      command: "repositorySyncRetrySpecific",
      repositoryPath: "C:/repo-a",
      repositoryName: "Repo A",
    });

    assert.ok(
      executeCommand.calledOnceWithExactly(Commands.REPOSITORY_SYNC_RETRY_SPECIFIC, {
        repositoryPath: "C:/repo-a",
        repositoryName: "Repo A",
      })
    );
  });

  test("routes repository sync batch conflict action from webview", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    const handler = new NexkitPanelMessageHandler(() => undefined, createServices());

    await handler.handleMessage({
      command: "repositorySyncApplyBatchConflictAction",
      conflictGroup: "external-conflict",
      action: "retry",
    });

    assert.ok(
      executeCommand.calledOnceWithExactly(Commands.REPOSITORY_SYNC_APPLY_BATCH_CONFLICT_ACTION, {
        conflictGroup: "external-conflict",
        action: "retry",
      })
    );
  });

  test("routes repository sync output open from webview", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    const handler = new NexkitPanelMessageHandler(() => undefined, createServices());

    await handler.handleMessage({ command: "repositorySyncShowOutput" });

    assert.ok(executeCommand.calledOnceWithExactly(Commands.REPOSITORY_SYNC_SHOW_OUTPUT));
  });

  test("repositorySyncGetConfiguration posts expected configuration payload", async () => {
    const postMessage = sandbox.stub().returns(true);
    const services = createServices();
    services.repositoryDiscovery = {
      getSyncableRepositories: async () => [
        { key: "workspace-a", name: "workspace-a", path: "C:/workspace/a", source: "workspace", isExternal: false },
        { key: "external-b", name: "external-b", path: "C:/external/b", source: "external", isExternal: true },
      ],
    } as any;

    sandbox.stub(SettingsManager, "getRepoSyncExternalRepositories").returns(["C:/watched/repo"]);
    sandbox.stub(SettingsManager, "getRepoSyncScanRootPaths").returns(["C:/roots"]);
    sandbox.stub(SettingsManager, "getRepoSyncHiddenRepositories").returns(["C:/hidden/repo"]);

    const handler = new NexkitPanelMessageHandler(
      () => ({ webview: { postMessage } } as unknown as vscode.WebviewView),
      services
    );

    await handler.handleMessage({ command: "repositorySyncGetConfiguration" });

    const configurationCall = postMessage
      .getCalls()
      .find((call) => call.args[0]?.command === "repositorySyncConfigurationUpdate");

    assert.ok(configurationCall, "Expected repositorySyncConfigurationUpdate message");
    assert.deepStrictEqual(configurationCall?.args[0].configuration.workspaceRepositories, [
      { name: "workspace-a", path: "C:\\workspace\\a" },
    ]);
    assert.deepStrictEqual(configurationCall?.args[0].configuration.watchedRepositories, ["C:\\watched\\repo"]);
    assert.deepStrictEqual(configurationCall?.args[0].configuration.scanRootPaths, ["C:\\roots"]);
    assert.deepStrictEqual(configurationCall?.args[0].configuration.hiddenRepositories, ["C:\\hidden\\repo"]);
  });

  test("browse add watched repository updates settings and posts refreshed configuration", async () => {
    const postMessage = sandbox.stub().returns(true);
    const services = createServices();
    services.repositoryDiscovery = {
      getSyncableRepositories: async () => [],
    } as any;

    sandbox.stub(vscode.window, "showOpenDialog").resolves([{ fsPath: "C:/new/repo" } as vscode.Uri]);
    sandbox.stub(SettingsManager, "getRepoSyncExternalRepositories").returns(["C:/existing/repo"]);
    sandbox.stub(SettingsManager, "getRepoSyncScanRootPaths").returns([]);
    sandbox.stub(SettingsManager, "getRepoSyncHiddenRepositories").returns([]);
    const setExternal = sandbox.stub(SettingsManager, "setRepoSyncExternalRepositories").resolves();

    const handler = new NexkitPanelMessageHandler(
      () => ({ webview: { postMessage } } as unknown as vscode.WebviewView),
      services
    );

    await handler.handleMessage({ command: "repositorySyncBrowseAddWatchedRepository" });

    assert.ok(setExternal.calledOnce);
    assert.deepStrictEqual(setExternal.firstCall.args[0], ["C:\\existing\\repo", "C:\\new\\repo"]);

    const configurationCall = postMessage
      .getCalls()
      .find((call) => call.args[0]?.command === "repositorySyncConfigurationUpdate");
    assert.ok(configurationCall, "Expected repositorySyncConfigurationUpdate message after add watched repository");
  });

  test("remove watched repository updates settings and posts refreshed configuration", async () => {
    const postMessage = sandbox.stub().returns(true);
    const services = createServices();
    services.repositoryDiscovery = {
      getSyncableRepositories: async () => [],
    } as any;

    sandbox
      .stub(SettingsManager, "getRepoSyncExternalRepositories")
      .returns(["C:/repo/one", "C:/repo/two"]);
    sandbox.stub(SettingsManager, "getRepoSyncScanRootPaths").returns([]);
    sandbox.stub(SettingsManager, "getRepoSyncHiddenRepositories").returns([]);
    const setExternal = sandbox.stub(SettingsManager, "setRepoSyncExternalRepositories").resolves();

    const handler = new NexkitPanelMessageHandler(
      () => ({ webview: { postMessage } } as unknown as vscode.WebviewView),
      services
    );

    await handler.handleMessage({ command: "repositorySyncRemoveWatchedRepository", path: "C:/repo/one" });

    assert.ok(setExternal.calledOnce);
    assert.deepStrictEqual(setExternal.firstCall.args[0], ["C:\\repo\\two"]);

    const configurationCall = postMessage
      .getCalls()
      .find((call) => call.args[0]?.command === "repositorySyncConfigurationUpdate");
    assert.ok(configurationCall, "Expected repositorySyncConfigurationUpdate message after remove watched repository");
  });

  test("browse add scan root updates settings and posts refreshed configuration", async () => {
    const postMessage = sandbox.stub().returns(true);
    const services = createServices();
    services.repositoryDiscovery = {
      getSyncableRepositories: async () => [],
    } as any;

    sandbox.stub(vscode.window, "showOpenDialog").resolves([{ fsPath: "C:/scan/new-root" } as vscode.Uri]);
    sandbox.stub(SettingsManager, "getRepoSyncExternalRepositories").returns([]);
    sandbox.stub(SettingsManager, "getRepoSyncScanRootPaths").returns(["C:/scan/existing"]);
    sandbox.stub(SettingsManager, "getRepoSyncHiddenRepositories").returns([]);
    const setScanRoots = sandbox.stub(SettingsManager, "setRepoSyncScanRootPaths").resolves();

    const handler = new NexkitPanelMessageHandler(
      () => ({ webview: { postMessage } } as unknown as vscode.WebviewView),
      services
    );

    await handler.handleMessage({ command: "repositorySyncBrowseAddScanRoot" });

    assert.ok(setScanRoots.calledOnce);
    assert.deepStrictEqual(setScanRoots.firstCall.args[0], ["C:\\scan\\existing", "C:\\scan\\new-root"]);

    const configurationCall = postMessage
      .getCalls()
      .find((call) => call.args[0]?.command === "repositorySyncConfigurationUpdate");
    assert.ok(configurationCall, "Expected repositorySyncConfigurationUpdate message after add scan root");
  });

  test("remove scan root updates settings and posts refreshed configuration", async () => {
    const postMessage = sandbox.stub().returns(true);
    const services = createServices();
    services.repositoryDiscovery = {
      getSyncableRepositories: async () => [],
    } as any;

    sandbox.stub(SettingsManager, "getRepoSyncExternalRepositories").returns([]);
    sandbox.stub(SettingsManager, "getRepoSyncScanRootPaths").returns(["C:/root/one", "C:/root/two"]);
    sandbox.stub(SettingsManager, "getRepoSyncHiddenRepositories").returns([]);
    const setScanRoots = sandbox.stub(SettingsManager, "setRepoSyncScanRootPaths").resolves();

    const handler = new NexkitPanelMessageHandler(
      () => ({ webview: { postMessage } } as unknown as vscode.WebviewView),
      services
    );

    await handler.handleMessage({ command: "repositorySyncRemoveScanRoot", path: "C:/root/one" });

    assert.ok(setScanRoots.calledOnce);
    assert.deepStrictEqual(setScanRoots.firstCall.args[0], ["C:\\root\\two"]);

    const configurationCall = postMessage
      .getCalls()
      .find((call) => call.args[0]?.command === "repositorySyncConfigurationUpdate");
    assert.ok(configurationCall, "Expected repositorySyncConfigurationUpdate message after remove scan root");
  });

  test("hides repository and posts refreshed configuration", async () => {
    const postMessage = sandbox.stub().returns(true);
    const services = createServices();
    services.repositoryDiscovery = {
      getSyncableRepositories: async () => [],
    } as any;

    sandbox.stub(SettingsManager, "getRepoSyncExternalRepositories").returns([]);
    sandbox.stub(SettingsManager, "getRepoSyncScanRootPaths").returns([]);
    sandbox.stub(SettingsManager, "getRepoSyncHiddenRepositories").returns(["C:/already/hidden"]);
    const setHidden = sandbox.stub(SettingsManager, "setRepoSyncHiddenRepositories").resolves();

    const handler = new NexkitPanelMessageHandler(
      () => ({ webview: { postMessage } } as unknown as vscode.WebviewView),
      services
    );

    await handler.handleMessage({ command: "repositorySyncHideRepository", path: "C:/to/hide" });

    assert.ok(setHidden.calledOnce);
    assert.deepStrictEqual(setHidden.firstCall.args[0], ["C:\\already\\hidden", "C:\\to\\hide"]);

    const feedbackCall = postMessage
      .getCalls()
      .find((call) => call.args[0]?.command === "repositorySyncActionFeedback" && call.args[0]?.feedback?.actionType === "hide-repository");
    assert.ok(feedbackCall, "Expected hide repository feedback message");
  });

  test("unhides repository and posts refreshed configuration", async () => {
    const postMessage = sandbox.stub().returns(true);
    const services = createServices();
    services.repositoryDiscovery = {
      getSyncableRepositories: async () => [],
    } as any;

    sandbox.stub(SettingsManager, "getRepoSyncExternalRepositories").returns([]);
    sandbox.stub(SettingsManager, "getRepoSyncScanRootPaths").returns([]);
    sandbox.stub(SettingsManager, "getRepoSyncHiddenRepositories").returns(["C:/hidden/one", "C:/hidden/two"]);
    const setHidden = sandbox.stub(SettingsManager, "setRepoSyncHiddenRepositories").resolves();

    const handler = new NexkitPanelMessageHandler(
      () => ({ webview: { postMessage } } as unknown as vscode.WebviewView),
      services
    );

    await handler.handleMessage({ command: "repositorySyncUnhideRepository", path: "C:/hidden/one" });

    assert.ok(setHidden.calledOnce);
    assert.deepStrictEqual(setHidden.firstCall.args[0], ["C:\\hidden\\two"]);

    const feedbackCall = postMessage
      .getCalls()
      .find((call) => call.args[0]?.command === "repositorySyncActionFeedback" && call.args[0]?.feedback?.actionType === "unhide-repository");
    assert.ok(feedbackCall, "Expected unhide repository feedback message");
  });
});