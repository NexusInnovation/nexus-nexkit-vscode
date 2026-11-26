/**
 * Tests for DevOpsPipelinesPanelService
 * Manages the "Azure DevOps Builds" webview panel. All collaborators (client, auth,
 * connection source, telemetry) are Sinon fakes — no network or VS Code auth is used.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  DevOpsPipelinesPanelService,
  IDevOpsConnectionSource,
} from "../../src/features/devops-pipelines/devOpsPipelinesPanelService";
import {
  DevOpsApiError,
  DevOpsBuildsClient,
  RawBuild,
  RawTimeline,
} from "../../src/features/devops-pipelines/devOpsBuildsClient";
import { IDevOpsAuthProvider } from "../../src/features/devops-pipelines/devOpsAuthProvider";
import { BuildLogViewService } from "../../src/features/devops-pipelines/buildLogViewService";
import { HostToWebviewMessage, WebviewToHostMessage } from "../../src/features/devops-pipelines/messages";
import { LoggingService } from "../../src/shared/services/loggingService";
import { TelemetryService } from "../../src/shared/services/telemetryService";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface FakePanelHandle {
  panel: vscode.WebviewPanel;
  messageListeners: Array<(message: WebviewToHostMessage) => void>;
  postMessageStub: sinon.SinonStub;
  revealStub: sinon.SinonStub;
  state: { visible: boolean };
}

function createFakePanel(): FakePanelHandle {
  const messageListeners: Array<(message: WebviewToHostMessage) => void> = [];
  const postMessageStub = sinon.stub().resolves(true);
  const revealStub = sinon.stub();
  const state = { visible: true };

  const webview = {
    html: "",
    cspSource: "vscode-resource:",
    asWebviewUri: (uri: vscode.Uri) => uri,
    postMessage: postMessageStub,
    onDidReceiveMessage: (listener: (message: WebviewToHostMessage) => void) => {
      messageListeners.push(listener);
      return { dispose: () => undefined };
    },
  };

  const panel = {
    webview,
    get visible() {
      return state.visible;
    },
    reveal: revealStub,
    dispose: sinon.stub(),
    onDidChangeViewState: () => ({ dispose: () => undefined }),
    onDidDispose: () => ({ dispose: () => undefined }),
  } as unknown as vscode.WebviewPanel;

  return { panel, messageListeners, postMessageStub, revealStub, state };
}

const rawBuild: RawBuild = {
  id: 7,
  buildNumber: "20261125.1",
  status: "completed",
  result: "succeeded",
  reason: "individualCI",
  sourceBranch: "refs/heads/main",
  sourceVersion: "abcdef1234",
  definition: { id: 1, name: "pipeline" },
};

const rawTimeline: RawTimeline = {
  records: [{ id: "s1", type: "Stage", name: "Build", state: "completed", result: "succeeded", order: 1 }],
};

suite("Unit: DevOpsPipelinesPanelService", () => {
  let fakePanel: FakePanelHandle;
  let createWebviewPanelStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let connections: { getActiveConnection: sinon.SinonStub; onConnectionsChanged: sinon.SinonStub };
  let client: {
    listBuilds: sinon.SinonStub;
    getBuild: sinon.SinonStub;
    getTimeline: sinon.SinonStub;
    cancelBuild: sinon.SinonStub;
    getStageDependencies: sinon.SinonStub;
    getBuildAuthor: sinon.SinonStub;
    getAvatarDataUri: sinon.SinonStub;
  };
  let auth: { getAccessToken: sinon.SinonStub };
  let telemetry: { trackEvent: sinon.SinonStub };
  let logTerminals: { open: sinon.SinonStub; followBuild: sinon.SinonStub };
  let service: DevOpsPipelinesPanelService;

  const activeConnection = { id: "org-proj", organization: "org", project: "proj", isActive: true, serverName: "azure-devops" };

  function posted(): HostToWebviewMessage[] {
    return fakePanel.postMessageStub.getCalls().map((c) => c.args[0] as HostToWebviewMessage);
  }

  async function send(message: WebviewToHostMessage): Promise<void> {
    fakePanel.messageListeners.forEach((l) => l(message));
    await flushMicrotasks();
    await flushMicrotasks();
  }

  setup(() => {
    fakePanel = createFakePanel();
    createWebviewPanelStub = sinon.stub(vscode.window, "createWebviewPanel").returns(fakePanel.panel);
    showWarningMessageStub = sinon.stub(vscode.window, "showWarningMessage");
    connections = {
      getActiveConnection: sinon.stub().resolves(activeConnection),
      onConnectionsChanged: sinon.stub().returns({ dispose: () => undefined }),
    };
    client = {
      listBuilds: sinon.stub().resolves([rawBuild]),
      getBuild: sinon.stub().resolves(rawBuild),
      getTimeline: sinon.stub().resolves(rawTimeline),
      cancelBuild: sinon.stub().resolves(),
      getStageDependencies: sinon.stub().resolves(new Map([["Build", []]])),
      getBuildAuthor: sinon.stub().resolves(undefined),
      getAvatarDataUri: sinon.stub().resolves(undefined),
    };
    auth = { getAccessToken: sinon.stub().resolves("token") };
    telemetry = { trackEvent: sinon.stub() };
    logTerminals = { open: sinon.stub().resolves(), followBuild: sinon.stub().resolves() };

    service = new DevOpsPipelinesPanelService(
      vscode.Uri.file("/ext"),
      connections as unknown as IDevOpsConnectionSource,
      client as unknown as DevOpsBuildsClient,
      auth as unknown as IDevOpsAuthProvider,
      LoggingService.getInstance(),
      telemetry as unknown as TelemetryService,
      logTerminals as unknown as BuildLogViewService
    );
  });

  teardown(() => {
    service.dispose();
    sinon.restore();
  });

  test("openPanel creates the panel once and reveals it afterwards", () => {
    service.openPanel();
    service.openPanel();

    assert.strictEqual(createWebviewPanelStub.callCount, 1);
    assert.strictEqual(fakePanel.revealStub.callCount, 1);
  });

  test("shows the change author and avatar instead of a service identity, once per finished build", async () => {
    const service_ = { displayName: "GitHub", uniqueName: "GitHub App\\2a1f3c4d-0000-1111-2222-333344445555" };
    client.listBuilds.resolves([{ ...rawBuild, requestedFor: service_, requestedBy: service_ }]);
    client.getBuildAuthor.resolves({ displayName: "Eric De Carufel", imageUrl: "https://dev.azure.com/avatar" });
    client.getAvatarDataUri.resolves("data:image/png;base64,AA==");
    service.openPanel();

    await send({ type: "webview-ready" });
    await send({ type: "refresh" });

    const lastBuilds = [...posted()].reverse().find((m) => m.type === "builds");
    assert.ok(lastBuilds && lastBuilds.type === "builds");
    assert.strictEqual(lastBuilds.builds[0].requestedFor, "Eric De Carufel");
    assert.strictEqual(lastBuilds.builds[0].requestedForImage, "data:image/png;base64,AA==");
    assert.strictEqual(client.getBuildAuthor.callCount, 1);
  });

  test("posts no-connection state when no active connection exists", async () => {
    connections.getActiveConnection.resolves(null);
    service.openPanel();

    await send({ type: "webview-ready" });

    assert.ok(posted().some((m) => m.type === "view-state" && m.state === "no-connection"));
    assert.strictEqual(client.listBuilds.callCount, 0);
  });

  test("loads builds with their stages when the webview is ready", async () => {
    service.openPanel();

    await send({ type: "webview-ready" });

    const messages = posted();
    assert.ok(messages.some((m) => m.type === "view-state" && m.state === "ready" && m.projectLabel === "org/proj"));
    const lastBuilds = [...messages].reverse().find((m) => m.type === "builds");
    assert.ok(lastBuilds && lastBuilds.type === "builds");
    assert.strictEqual(lastBuilds.builds.length, 1);
    assert.deepStrictEqual(lastBuilds.builds[0].stages, [{ name: "Build", state: "succeeded" }]);
  });

  test("does not reload the timeline of finished builds on later refreshes", async () => {
    service.openPanel();

    await send({ type: "webview-ready" });
    await send({ type: "refresh" });

    assert.strictEqual(client.getTimeline.callCount, 1);
  });

  test("posts needs-auth state when the API rejects the token", async () => {
    client.listBuilds.rejects(new DevOpsApiError("auth", "Sign in required", 401));
    service.openPanel();

    await send({ type: "webview-ready" });

    assert.ok(posted().some((m) => m.type === "view-state" && m.state === "needs-auth"));
  });

  test("select-build posts the build detail", async () => {
    service.openPanel();
    await send({ type: "webview-ready" });

    await send({ type: "select-build", buildId: 7 });

    assert.ok(posted().some((m) => m.type === "build-detail" && m.detail.id === 7));
  });

  test("select-build resolves stage dependencies once for finished builds", async () => {
    service.openPanel();
    await send({ type: "webview-ready" });

    await send({ type: "select-build", buildId: 7 });
    await send({ type: "refresh" });

    const detail = [...posted()].reverse().find((m) => m.type === "build-detail");
    assert.ok(detail && detail.type === "build-detail");
    assert.strictEqual(detail.detail.dependenciesInferred, false);
    assert.strictEqual(client.getStageDependencies.callCount, 1);
  });

  test("select-build still posts the detail when dependencies cannot be resolved", async () => {
    client.getStageDependencies.rejects(new Error("boom"));
    service.openPanel();
    await send({ type: "webview-ready" });

    await send({ type: "select-build", buildId: 7 });

    assert.ok(posted().some((m) => m.type === "build-detail" && m.detail.id === 7));
  });

  test("open-log shows the selected record in the build log view", async () => {
    service.openPanel();
    await send({ type: "webview-ready" });

    await send({ type: "open-log", buildId: 7, recordId: "task-1" });

    assert.strictEqual(logTerminals.open.callCount, 1);
    assert.deepStrictEqual(logTerminals.open.firstCall.args, [
      { organization: "org", project: "proj" },
      7,
      "20261125.1",
      "task-1",
    ]);
  });

  test("follow-log opens the live build log", async () => {
    service.openPanel();
    await send({ type: "webview-ready" });

    await send({ type: "follow-log", buildId: 7 });

    assert.deepStrictEqual(logTerminals.followBuild.firstCall.args, [{ organization: "org", project: "proj" }, 7, "20261125.1"]);
    assert.strictEqual(logTerminals.open.callCount, 0);
  });

  test("cancel-build calls the client only after confirmation", async () => {
    service.openPanel();
    await send({ type: "webview-ready" });

    showWarningMessageStub.resolves(undefined);
    await send({ type: "cancel-build", buildId: 7 });
    assert.strictEqual(client.cancelBuild.callCount, 0);

    showWarningMessageStub.resolves("Cancel Build");
    await send({ type: "cancel-build", buildId: 7 });
    assert.strictEqual(client.cancelBuild.callCount, 1);
    assert.ok(posted().some((m) => m.type === "cancel-result" && m.success && m.buildId === 7));
  });

  test("polls again while the panel is visible and stops when hidden", async () => {
    const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      service.openPanel();
      await send({ type: "webview-ready" });
      assert.strictEqual(client.listBuilds.callCount, 1);

      await clock.tickAsync(30_000);
      await flushMicrotasks();
      assert.strictEqual(client.listBuilds.callCount, 2);

      fakePanel.state.visible = false;
      await send({ type: "refresh" });
      const callsAfterHide = client.listBuilds.callCount;
      await clock.tickAsync(60_000);
      assert.strictEqual(client.listBuilds.callCount, callsAfterHide);
    } finally {
      clock.restore();
    }
  });
});
