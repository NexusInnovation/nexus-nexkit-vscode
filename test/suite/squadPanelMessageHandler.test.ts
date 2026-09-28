import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { NexkitPanelMessageHandler } from "../../src/features/panel-ui/nexkitPanelMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import {
  SquadDetectionResult,
  SquadInstallState,
  SquadResult,
  SquadUpdatesResult,
  SquadUpdateTarget,
  SquadUpgradeCommand,
  squadErr,
  squadOk,
  SquadVersionStatus,
} from "../../src/features/squad/models";
import { SquadLogKind } from "../../src/features/squad/services/squadFileService";

function detectionResult(): SquadDetectionResult {
  return {
    project: {
      installState: SquadInstallState.Installed,
      markers: {
        ".squad/config.json": true,
        ".squad/team.md": true,
        ".github/agents/squad.agent.md": true,
      },
      projectVersion: "1.2.3",
      versionStatus: SquadVersionStatus.UpToDate,
    },
    cli: { installed: false, cliVersion: null, versionStatus: SquadVersionStatus.Unknown },
    detectedAt: 0,
  };
}

interface SquadStubs {
  detect: sinon.SinonStub;
  readRoster: sinon.SinonStub;
  readCharter: sinon.SinonStub;
  readDecisions: sinon.SinonStub;
  readRouting: sinon.SinonStub;
  readAgentHistory: sinon.SinonStub;
  listLogs: sinon.SinonStub;
  readLog: sinon.SinonStub;
  readUpstreams: sinon.SinonStub;
  runDoctor: sinon.SinonStub;
  checkUpdates: sinon.SinonStub;
}

function createStubs(): SquadStubs {
  return {
    detect: sinon.stub().resolves(squadOk(detectionResult())),
    readRoster: sinon.stub().resolves(squadOk([])),
    readCharter: sinon.stub(),
    readDecisions: sinon
      .stub()
      .resolves(squadOk({ kind: "decisions", relativePath: ".squad/decisions.md", exists: true, content: "d" })),
    readRouting: sinon
      .stub()
      .resolves(squadOk({ kind: "routing", relativePath: ".squad/routing.md", exists: false, content: "" })),
    readAgentHistory: sinon.stub(),
    listLogs: sinon.stub().resolves(squadOk([])),
    readLog: sinon.stub(),
    readUpstreams: sinon.stub().resolves(squadOk([])),
    runDoctor: sinon.stub(),
    checkUpdates: sinon.stub().resolves(squadOk(updatesResult())),
  };
}

function updatesResult(): SquadUpdatesResult {
  const detection = detectionResult();
  detection.cli = {
    installed: true,
    source: "global",
    cliVersion: "1.0.0",
    versionStatus: SquadVersionStatus.UpdateAvailable,
  };
  detection.project = {
    ...detection.project,
    projectVersion: "1.0.0",
    versionStatus: SquadVersionStatus.UpdateAvailable,
  };
  return {
    detection,
    cli: {
      target: SquadUpdateTarget.Cli,
      currentVersion: "1.0.0",
      latestVersion: "1.2.0",
      status: SquadVersionStatus.UpdateAvailable,
      updateAvailable: true,
      upgradeCommand: SquadUpgradeCommand.CliSelf,
      requiresConfirmation: true,
      requiresBackup: false,
      message: "Squad CLI update available: 1.0.0 -> 1.2.0.",
    },
    project: {
      target: SquadUpdateTarget.Project,
      currentVersion: "1.0.0",
      latestVersion: "1.2.0",
      status: SquadVersionStatus.UpdateAvailable,
      updateAvailable: true,
      upgradeCommand: SquadUpgradeCommand.Project,
      requiresConfirmation: true,
      requiresBackup: true,
      message: "Squad project update available: 1.0.0 -> 1.2.0.",
    },
    checkedAt: 123,
  };
}

function createServices(stubs: SquadStubs, hasWorkspace = true): ServiceContainer {
  const squadFile = hasWorkspace
    ? {
        readRoster: stubs.readRoster,
        readCharter: stubs.readCharter,
        readDecisions: stubs.readDecisions,
        readRouting: stubs.readRouting,
        readAgentHistory: stubs.readAgentHistory,
        listLogs: stubs.listLogs,
        readLog: stubs.readLog,
        readUpstreams: stubs.readUpstreams,
      }
    : undefined;

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
    logging: {
      warn: () => undefined,
      error: () => undefined,
      info: () => undefined,
    },
    squadDetection: {
      detect: stubs.detect,
    },
    squadCli: {
      runDoctor: stubs.runDoctor,
    },
    squadUpdates: {
      checkUpdates: stubs.checkUpdates,
    },
    squadFile,
  } as unknown as ServiceContainer;
}

suite("Unit: SquadPanelMessageHandler (host routing SQD-008)", () => {
  let sandbox: sinon.SinonSandbox;
  let posted: ExtensionMessage[];
  let getWebview: () => vscode.WebviewView | undefined;

  setup(() => {
    sandbox = sinon.createSandbox();
    posted = [];
    const view = {
      webview: {
        postMessage: (message: ExtensionMessage) => {
          posted.push(message);
          return Promise.resolve(true);
        },
      },
    } as unknown as vscode.WebviewView;
    getWebview = () => view;
  });

  teardown(() => {
    sandbox.restore();
  });

  function commands(): string[] {
    return posted.map((m) => m.command);
  }

  function find<T extends ExtensionMessage["command"]>(command: T): Extract<ExtensionMessage, { command: T }> | undefined {
    return posted.find((m) => m.command === command) as Extract<ExtensionMessage, { command: T }> | undefined;
  }

  test("getSquadState emits status, roster, docs and logs", async () => {
    const stubs = createStubs();
    stubs.readRoster.resolves(
      squadOk([
        { id: "morpheus", name: "Morpheus", hasCharter: true },
        { id: "link", name: "Link", hasCharter: false },
      ])
    );
    stubs.readCharter
      .withArgs("morpheus")
      .resolves(squadOk({ agentId: "morpheus", relativePath: ".squad/agents/morpheus/charter.md", content: "c" }));
    stubs.readAgentHistory.resolves(squadErr({ code: "file-read-failed", message: "no history" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "getSquadState" });

    const status = find("squadStatusUpdate");
    assert.ok(status, "expected squadStatusUpdate");
    assert.strictEqual(status.detection.project.installState, SquadInstallState.Installed);
    assert.deepStrictEqual(status.plugins, []);

    const roster = find("squadRosterUpdate");
    assert.ok(roster);
    assert.strictEqual(roster.roster.length, 2);
    assert.strictEqual(roster.charters.length, 1, "only members with a charter are read");
    assert.ok(stubs.readCharter.calledOnceWithExactly("morpheus"));

    const docs = find("squadDocsUpdate");
    assert.ok(docs);
    assert.strictEqual(docs.decisions?.content, "d");
    assert.strictEqual(docs.routing?.exists, false);

    assert.ok(find("squadLogsUpdate"), "expected squadLogsUpdate");
  });

  test("getSquadState collects logs from histories and streams with mapped kinds", async () => {
    const stubs = createStubs();
    stubs.readRoster.resolves(squadOk([{ id: "morpheus", name: "Morpheus", hasCharter: false }]));
    stubs.readAgentHistory.resolves(
      squadOk({ relativePath: ".squad/agents/morpheus/history.md", content: "h", sizeBytes: 1, truncated: false })
    );
    stubs.listLogs
      .withArgs(SquadLogKind.Session)
      .resolves(squadOk([{ name: "s.md", kind: SquadLogKind.Session, relativePath: ".squad/log/s.md", sizeBytes: 1 }]));
    stubs.listLogs
      .withArgs(SquadLogKind.Orchestration)
      .resolves(
        squadOk([{ name: "o.md", kind: SquadLogKind.Orchestration, relativePath: ".squad/orchestration-log/o.md", sizeBytes: 1 }])
      );
    stubs.readLog
      .withArgs(SquadLogKind.Session, "s.md")
      .resolves(squadOk({ relativePath: ".squad/log/s.md", content: "sc", sizeBytes: 1, truncated: false }));
    stubs.readLog
      .withArgs(SquadLogKind.Orchestration, "o.md")
      .resolves(squadOk({ relativePath: ".squad/orchestration-log/o.md", content: "oc", sizeBytes: 1, truncated: false }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "getSquadState" });

    const logs = find("squadLogsUpdate");
    assert.ok(logs);
    const kinds = logs.logs.map((l) => l.kind).sort();
    assert.deepStrictEqual(kinds, ["agent-history", "log", "orchestration"]);
    const history = logs.logs.find((l) => l.kind === "agent-history");
    assert.strictEqual(history?.agentId, "morpheus");
  });

  test("getSquadState emits squadError when detection fails", async () => {
    const stubs = createStubs();
    stubs.detect.resolves(squadErr({ code: "not-a-workspace", message: "no workspace" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "getSquadState" });

    assert.deepStrictEqual(commands(), ["squadError"]);
    const error = find("squadError");
    assert.strictEqual(error?.error.code, "not-a-workspace");
  });

  test("getSquadState surfaces a sub-read failure via squadError after emitting data", async () => {
    const stubs = createStubs();
    stubs.readRoster.resolves(squadErr({ code: "file-read-failed", message: "no roster" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "getSquadState" });

    assert.ok(find("squadStatusUpdate"), "status still emitted");
    const error = find("squadError");
    assert.strictEqual(error?.error.code, "file-read-failed");
  });

  test("getSquadState surfaces an upstream read failure and does not hide it as success", async () => {
    const stubs = createStubs();
    stubs.readUpstreams.resolves(squadErr({ code: "parse-failed", message: "bad upstreams", remediation: "fix JSON" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "getSquadState" });

    const status = find("squadStatusUpdate");
    assert.ok(status, "status is still emitted for other Squad state");
    assert.deepStrictEqual(status.upstreams, []);
    const error = find("squadError");
    assert.strictEqual(error?.error.code, "parse-failed");
    assert.strictEqual(error?.error.remediation, "fix JSON");
  });

  test("getSquadState without a workspace folder emits only status", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs, false));

    await handler.handleMessage({ command: "getSquadState" });

    assert.deepStrictEqual(commands(), ["squadStatusUpdate"]);
    assert.ok(stubs.readRoster.notCalled);
  });

  test("refreshSquadDetection wraps detection with loading and emits status", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "refreshSquadDetection" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadStatusUpdate", "squadLoading"]);
    assert.strictEqual((find("squadLoading") as { isLoading: boolean }).isLoading, true);
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("refreshSquadDetection emits squadError and still clears loading on failure", async () => {
    const stubs = createStubs();
    stubs.detect.resolves(squadErr({ code: "detection-failed", message: "boom" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "refreshSquadDetection" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadError", "squadLoading"]);
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("refreshSquadDetection surfaces upstream read errors after status update", async () => {
    const stubs = createStubs();
    stubs.readUpstreams.resolves(squadErr({ code: "parse-failed", message: "bad upstreams" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "refreshSquadDetection" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadStatusUpdate", "squadError", "squadLoading"]);
    assert.strictEqual(find("squadError")?.error.code, "parse-failed");
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("saveSquadCharter responds with a not-available squadError", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadCharter", agentId: "morpheus", content: "x" });

    const error = find("squadError");
    assert.strictEqual(error?.error.code, "file-write-failed");
    assert.ok(error.error.remediation);
  });

  test("saveSquadDoc responds with a not-available squadError", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadDoc", kind: "decisions", content: "x" });

    assert.strictEqual(find("squadError")?.error.code, "file-write-failed");
  });

  test("runSquadDoctor emits squadDoctorUpdate with the parsed report", async () => {
    const stubs = createStubs();
    const report = {
      overall: "warning",
      checks: [{ label: "CLI", severity: "warning", message: "update available" }],
      structured: true,
      generatedAt: 123,
    };
    stubs.runDoctor.resolves(squadOk(report));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "runSquadDoctor" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadDoctorUpdate", "squadLoading"]);
    const update = find("squadDoctorUpdate");
    assert.ok(update);
    assert.deepStrictEqual(update.doctor, report);
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
    assert.ok(stubs.runDoctor.calledOnce);
  });

  test("runSquadDoctor emits squadError and clears loading on CLI failure", async () => {
    const stubs = createStubs();
    stubs.runDoctor.resolves(squadErr({ code: "cli-not-found", message: "no cli", remediation: "install it" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "runSquadDoctor" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadError", "squadLoading"]);
    assert.strictEqual(find("squadError")?.error.code, "cli-not-found");
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("checkSquadUpdates emits status and the reusable update contract", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "checkSquadUpdates" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadStatusUpdate", "squadUpdatesUpdate", "squadLoading"]);
    const update = find("squadUpdatesUpdate");
    assert.ok(update);
    assert.strictEqual(update.updates.cli.updateAvailable, true);
    assert.strictEqual(update.updates.cli.upgradeCommand, SquadUpgradeCommand.CliSelf);
    assert.strictEqual(update.updates.project.requiresBackup, true);
    assert.ok(stubs.checkUpdates.calledOnce);
  });

  test("checkSquadUpdates emits squadError and clears loading on lookup failure", async () => {
    const stubs = createStubs();
    stubs.checkUpdates.resolves(squadErr({ code: "update-check-failed", message: "offline", remediation: "connect" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "checkSquadUpdates" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadError", "squadLoading"]);
    assert.strictEqual(find("squadError")?.error.code, "update-check-failed");
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("unknown command is ignored without posting a message", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "notARealCommand" } as unknown as never);

    assert.strictEqual(posted.length, 0);
  });
});
