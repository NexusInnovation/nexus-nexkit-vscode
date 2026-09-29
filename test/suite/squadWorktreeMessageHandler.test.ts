import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { NexkitPanelMessageHandler } from "../../src/features/panel-ui/nexkitPanelMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import {
  SquadBacklogProviderId,
  SquadWorktreeBranchSource,
  SquadWorktreeDependencyMode,
  SquadWorktreeDependencyState,
  SquadWorktreeRemovalFallback,
  squadOk,
} from "../../src/features/squad/models";

function createServices(stubs: WorktreeStubs): ServiceContainer {
  return {
    aiTemplateData: {
      onDataChanged: () => ({ dispose: () => undefined }),
      onUpdatesAvailableChanged: () => ({ dispose: () => undefined }),
    },
    profileService: { onProfilesChanged: () => ({ dispose: () => undefined }) },
    workspaceInitialization: { onWorkspaceInitialized: () => ({ dispose: () => undefined }) },
    devOpsConfig: { onConnectionsChanged: () => ({ dispose: () => undefined }) },
    templateMetadataScanner: {
      onScanProgressChanged: () => ({ dispose: () => undefined }),
      onScanComplete: () => ({ dispose: () => undefined }),
    },
    telemetry: { trackEvent: () => undefined },
    logging: { warn: () => undefined, error: () => undefined, info: () => undefined },
    squadWorktrees: stubs,
  } as unknown as ServiceContainer;
}

interface WorktreeStubs {
  listItems: sinon.SinonStub;
  list: sinon.SinonStub;
  previewCreate: sinon.SinonStub;
  create: sinon.SinonStub;
  open: sinon.SinonStub;
  findCleanupCandidates: sinon.SinonStub;
  cleanup: sinon.SinonStub;
  retryDependencies: sinon.SinonStub;
}

function createWorktreeStubs(): WorktreeStubs {
  const worktree = {
    id: "wt-269",
    displayPath: "C:\\git\\repo-269",
    branch: "squad/269-ui",
    head: "abc",
    issueNumber: 269,
    isMain: false,
    isCurrentWindow: false,
    locked: false,
    prunable: false,
    dirty: false,
    ahead: 0,
    behind: 0,
    baseBranch: "develop",
    dependencies: SquadWorktreeDependencyState.Installed,
  };
  return {
    listItems: sinon.stub().resolves(
      squadOk([
        {
          providerId: SquadBacklogProviderId.GitHub,
          id: "269",
          number: 269,
          title: "UI",
          url: null,
          state: "open",
          labels: ["squad"],
          assignees: [],
        },
      ])
    ),
    list: sinon.stub().resolves(squadOk([worktree])),
    previewCreate: sinon.stub().resolves(
      squadOk({
        providerId: SquadBacklogProviderId.GitHub,
        itemId: "269",
        issueNumber: 269,
        branch: "squad/269-ui",
        displayPath: "C:\\git\\repo-269",
        baseBranch: "develop",
        branchSource: SquadWorktreeBranchSource.New,
        warnings: [],
      })
    ),
    create: sinon.stub().resolves(
      squadOk({
        worktree,
        branch: "squad/269-ui",
        branchSource: SquadWorktreeBranchSource.New,
        baseBranch: "develop",
        baseFetched: true,
        dependencies: { mode: SquadWorktreeDependencyMode.Install, state: SquadWorktreeDependencyState.Installed, error: null },
        seededCount: 0,
        opened: false,
        warnings: [],
      })
    ),
    open: sinon.stub().resolves(squadOk(undefined)),
    findCleanupCandidates: sinon.stub().resolves(squadOk([{ worktree, reasons: ["pr-merged"], blockers: [] }])),
    cleanup: sinon.stub().resolves(
      squadOk({
        removed: true,
        branchDeleted: true,
        stashed: false,
        fallback: SquadWorktreeRemovalFallback.None,
        warnings: [],
      })
    ),
    retryDependencies: sinon
      .stub()
      .resolves(
        squadOk({ mode: SquadWorktreeDependencyMode.Install, state: SquadWorktreeDependencyState.Installed, error: null })
      ),
  };
}

suite("Unit: SquadWorktreeMessageHandler (host routing SQD-054)", () => {
  let sandbox: sinon.SinonSandbox;
  let posted: ExtensionMessage[];

  setup(() => {
    sandbox = sinon.createSandbox();
    posted = [];
    sandbox
      .stub(vscode.window, "withProgress")
      .callsFake(async (_options, task) => task({ report: () => undefined }, new vscode.CancellationTokenSource().token));
    sandbox.stub(vscode.window, "showWarningMessage").resolves("Clean up worktree" as never);
  });

  teardown(() => {
    sandbox.restore();
  });

  function createHandler(stubs: WorktreeStubs): NexkitPanelMessageHandler {
    const view = {
      webview: {
        postMessage: (message: ExtensionMessage) => {
          posted.push(message);
          return Promise.resolve(true);
        },
      },
    } as unknown as vscode.WebviewView;
    return new NexkitPanelMessageHandler(() => view, createServices(stubs));
  }

  function find<T extends ExtensionMessage["command"]>(command: T): Extract<ExtensionMessage, { command: T }> | undefined {
    return posted.find((message) => message.command === command) as Extract<ExtensionMessage, { command: T }> | undefined;
  }

  test("routes list, preview and create worktree actions to the service", async () => {
    const stubs = createWorktreeStubs();
    const handler = createHandler(stubs);

    await handler.handleMessage({ command: "listSquadBacklogItems" });
    await handler.handleMessage({
      command: "previewSquadWorktree",
      request: { providerId: SquadBacklogProviderId.GitHub, itemId: "269" },
    });
    await handler.handleMessage({
      command: "createSquadWorktree",
      request: { providerId: SquadBacklogProviderId.GitHub, itemId: "269", dependencies: SquadWorktreeDependencyMode.Install },
    });

    assert.ok(stubs.listItems.calledOnce);
    assert.ok(stubs.previewCreate.calledOnce);
    assert.ok(stubs.create.calledOnce);
    assert.ok(find("squadBacklogItemsUpdate"));
    assert.ok(find("squadWorktreePreview"));
    assert.ok(find("squadWorktreeCreated"));
    assert.ok(find("squadWorktreesUpdate"));
  });

  test("confirms cleanup in the host and sends only the worktree id to the service", async () => {
    const stubs = createWorktreeStubs();
    const handler = createHandler(stubs);

    await handler.handleMessage({
      command: "cleanupSquadWorktree",
      request: { worktreeId: "wt-269", deleteBranch: true, discardChanges: false },
    });

    assert.ok((vscode.window.showWarningMessage as sinon.SinonStub).calledOnce);
    assert.ok(stubs.cleanup.calledOnceWithExactly({ worktreeId: "wt-269", deleteBranch: true, discardChanges: false }));
    assert.strictEqual(find("squadWorktreeCleanupResult")?.worktreeId, "wt-269");
  });

  test("routes dependency retry and open actions", async () => {
    const stubs = createWorktreeStubs();
    const handler = createHandler(stubs);

    await handler.handleMessage({ command: "retrySquadWorktreeDependencies", worktreeId: "wt-269", dependencies: "install" });
    await handler.handleMessage({ command: "openSquadWorktree", worktreeId: "wt-269", newWindow: true });

    assert.ok(stubs.retryDependencies.calledOnceWithExactly("wt-269", "install"));
    assert.ok(stubs.open.calledOnceWithExactly("wt-269", { newWindow: true }));
    assert.ok(find("squadWorktreeDependencyRetried"));
    assert.ok(find("squadWorktreeOpened"));
  });
});
