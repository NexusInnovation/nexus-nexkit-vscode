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

  test("opens the RTF converter panel from the webview", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    const handler = new NexkitPanelMessageHandler(() => undefined, createServices());

    await handler.handleMessage({ command: "openRtfConverter" });

    assert.ok(executeCommand.calledOnceWithExactly(Commands.OPEN_RTF_CONVERTER));
  });

  test("opens the JSON Formatter panel from the webview", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    const handler = new NexkitPanelMessageHandler(() => undefined, createServices());

    await handler.handleMessage({ command: "openJsonFormatter" });

    assert.ok(executeCommand.calledOnceWithExactly(Commands.OPEN_JSON_FORMATTER));
  });
});