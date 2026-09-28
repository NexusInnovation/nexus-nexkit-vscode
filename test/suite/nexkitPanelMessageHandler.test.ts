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

  test("opens the Convert to Markdown panel from the webview", async () => {
    const executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    const handler = new NexkitPanelMessageHandler(() => undefined, createServices());

    await handler.handleMessage({ command: "openConvertToMarkdown" });

    assert.ok(executeCommand.calledOnceWithExactly(Commands.OPEN_CONVERT_TO_MARKDOWN));
  });

  suite("initialize (non-blocking startup)", () => {
    function createInitServices(templatesReady: Promise<void>): ServiceContainer {
      const base = createServices() as unknown as Record<string, Record<string, unknown>>;
      return {
        ...base,
        aiTemplateData: {
          ...base.aiTemplateData,
          waitForReady: () => templatesReady,
          getRepositoryTemplatesMap: () => [],
          syncInstalledTemplates: async () => undefined,
          getInstalledTemplates: () => ({ agents: [], prompts: [], skills: [], instructions: [], chatmodes: [], hooks: [] }),
          getUpdatesAvailable: () => false,
        },
        profileService: { ...base.profileService, getProfiles: () => [] },
        devOpsConfig: { ...base.devOpsConfig, getConnections: async () => [] },
        templateMetadataScanner: {
          ...base.templateMetadataScanner,
          isScanComplete: () => false,
          getProgress: () => ({ isScanning: false, scannedCount: 0, totalCount: 0 }),
        },
        githubWorkflowRunner: { listWorkflows: async () => [] },
        logging: { warn: () => undefined, error: () => undefined, info: () => undefined },
      } as unknown as ServiceContainer;
    }

    function createWebview(posted: string[]): () => vscode.WebviewView {
      const view = {
        webview: {
          postMessage: (message: { command: string }) => {
            posted.push(message.command);
            return Promise.resolve(true);
          },
        },
      } as unknown as vscode.WebviewView;
      return () => view;
    }

    const flush = async (): Promise<void> => {
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    };

    test("sends workspace, profiles, installed, DevOps and workflows while templates are still loading", async () => {
      let releaseTemplates: () => void = () => undefined;
      const templatesReady = new Promise<void>((resolve) => {
        releaseTemplates = resolve;
      });
      const posted: string[] = [];
      const handler = new NexkitPanelMessageHandler(createWebview(posted), createInitServices(templatesReady));

      const done = handler.initialize();
      await flush();

      for (const command of [
        "workspaceStateUpdate",
        "profilesUpdate",
        "installedTemplatesUpdate",
        "templateUpdatesAvailable",
        "metadataScanProgress",
        "devOpsConnectionsUpdate",
        "workflowListUpdate",
      ]) {
        assert.ok(posted.includes(command), `expected ${command} before templates are ready`);
      }
      assert.ok(!posted.includes("templateDataUpdate"), "templates must not be sent before they are ready");

      releaseTemplates();
      await done;

      assert.ok(posted.includes("templateDataUpdate"));
    });

    test("sends workspace state first so the webview can replace its skeleton", async () => {
      const posted: string[] = [];
      const handler = new NexkitPanelMessageHandler(createWebview(posted), createInitServices(Promise.resolve()));

      await handler.initialize();

      assert.strictEqual(posted[0], "workspaceStateUpdate");
    });

    test("a failing slow source does not prevent the others from being sent", async () => {
      const posted: string[] = [];
      const services = createInitServices(Promise.resolve());
      (services.devOpsConfig as unknown as { getConnections: () => Promise<never> }).getConnections = async () => {
        throw new Error("boom");
      };
      (services.githubWorkflowRunner as unknown as { listWorkflows: () => Promise<never> }).listWorkflows = async () => {
        throw new Error("boom");
      };
      sandbox.stub(console, "error");
      const handler = new NexkitPanelMessageHandler(createWebview(posted), services);

      await handler.initialize();

      assert.ok(posted.includes("templateDataUpdate"));
      assert.ok(posted.includes("devOpsConnectionError"));
    });
  });
});