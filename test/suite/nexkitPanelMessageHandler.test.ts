import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { NexkitPanelMessageHandler } from "../../src/features/panel-ui/nexkitPanelMessageHandler";
import { Commands } from "../../src/shared/constants/commands";

function createServices(): ServiceContainer {
  return {
    marketplace: {
      onDidChange: () => ({ dispose: () => undefined }),
      getConfigured: () => [],
      getSuggestions: () => [],
      add: async () => [],
      remove: async () => [],
    },
    workspaceInitialization: {
      onWorkspaceInitialized: () => ({ dispose: () => undefined }),
    },
    devOpsConfig: {
      onConnectionsChanged: () => ({ dispose: () => undefined }),
    },
    telemetry: {
      trackEvent: () => undefined,
      trackError: () => undefined,
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

  suite("marketplaces", () => {
    function createWebview(posted: Array<{ command: string; [key: string]: unknown }>): () => vscode.WebviewView {
      const view = {
        webview: {
          postMessage: (message: { command: string }) => {
            posted.push(message);
            return Promise.resolve(true);
          },
        },
      } as unknown as vscode.WebviewView;
      return () => view;
    }

    test("addMarketplace stores the source and refreshes the webview", async () => {
      const posted: Array<{ command: string; [key: string]: unknown }> = [];
      const services = createServices();
      const add = sandbox.stub(services.marketplace, "add").resolves(["owner/repo"]);
      const handler = new NexkitPanelMessageHandler(createWebview(posted), services);

      await handler.handleMessage({ command: "addMarketplace", source: "owner/repo" });

      assert.ok(add.calledOnceWithExactly("owner/repo"));
      assert.ok(posted.some((m) => m.command === "marketplacesUpdate"));
    });

    test("addMarketplace reports validation errors to the webview", async () => {
      const posted: Array<{ command: string; [key: string]: unknown }> = [];
      const services = createServices();
      sandbox.stub(services.marketplace, "add").rejects(new Error("invalid source"));
      const handler = new NexkitPanelMessageHandler(createWebview(posted), services);

      await handler.handleMessage({ command: "addMarketplace", source: "nope" });

      assert.deepStrictEqual(
        posted.find((m) => m.command === "marketplaceError"),
        { command: "marketplaceError", error: "invalid source" }
      );
    });

    test("removeMarketplace removes the source and refreshes the webview", async () => {
      const posted: Array<{ command: string; [key: string]: unknown }> = [];
      const services = createServices();
      const remove = sandbox.stub(services.marketplace, "remove").resolves([]);
      const handler = new NexkitPanelMessageHandler(createWebview(posted), services);

      await handler.handleMessage({ command: "removeMarketplace", source: "owner/repo" });

      assert.ok(remove.calledOnceWithExactly("owner/repo"));
      assert.ok(posted.some((m) => m.command === "marketplacesUpdate"));
    });
  });
});