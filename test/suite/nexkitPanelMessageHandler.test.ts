import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
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
});