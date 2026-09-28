import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { NexkitPanelMessageHandler } from "../../src/features/panel-ui/nexkitPanelMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import {
  SquadDetectionResult,
  SquadDocKind,
  SquadInstallState,
  SquadResult,
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
  saveCharter: sinon.SinonStub;
  saveMarkdownDoc: sinon.SinonStub;
  runDoctor: sinon.SinonStub;
}

function createStubs(): SquadStubs {
  return {
    detect: sinon.stub().resolves(squadOk(detectionResult())),
    readRoster: sinon.stub().resolves(squadOk([])),
    readCharter: sinon.stub(),
    readDecisions: sinon.stub().resolves(squadOk({ kind: "decisions", relativePath: ".squad/decisions.md", exists: true, content: "d" })),
    readRouting: sinon.stub().resolves(squadOk({ kind: "routing", relativePath: ".squad/routing.md", exists: false, content: "" })),
    readAgentHistory: sinon.stub(),
    listLogs: sinon.stub().resolves(squadOk([])),
    readLog: sinon.stub(),
    readUpstreams: sinon.stub().resolves(squadOk([])),
    saveCharter: sinon.stub().resolves(
      squadOk({
        relativePath: ".squad/agents/link/charter.md",
        created: false,
        backupPath: "backup",
        bytesWritten: 9,
        charter: { agentId: "link", relativePath: ".squad/agents/link/charter.md", content: "# Charter" },
      })
    ),
    saveMarkdownDoc: sinon.stub().resolves(
      squadOk({
        relativePath: ".squad/decisions.md",
        created: false,
        backupPath: "backup",
        bytesWritten: 11,
        doc: { kind: SquadDocKind.Decisions, relativePath: ".squad/decisions.md", exists: true, content: "# Decisions" },
      })
    ),
    runDoctor: sinon.stub(),
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
  const squadWrite = hasWorkspace
    ? {
        saveCharter: stubs.saveCharter,
        saveMarkdownDoc: stubs.saveMarkdownDoc,
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
    squadFile,
    squadWrite,
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
      squadOk([{ id: "morpheus", name: "Morpheus", hasCharter: true }, { id: "link", name: "Link", hasCharter: false }])
    );
    stubs.readCharter.withArgs("morpheus").resolves(
      squadOk({ agentId: "morpheus", relativePath: ".squad/agents/morpheus/charter.md", content: "c" })
    );
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
    stubs.listLogs.withArgs(SquadLogKind.Session).resolves(
      squadOk([{ name: "s.md", kind: SquadLogKind.Session, relativePath: ".squad/log/s.md", sizeBytes: 1 }])
    );
    stubs.listLogs.withArgs(SquadLogKind.Orchestration).resolves(
      squadOk([{ name: "o.md", kind: SquadLogKind.Orchestration, relativePath: ".squad/orchestration-log/o.md", sizeBytes: 1 }])
    );
    stubs.readLog.withArgs(SquadLogKind.Session, "s.md").resolves(
      squadOk({ relativePath: ".squad/log/s.md", content: "sc", sizeBytes: 1, truncated: false })
    );
    stubs.readLog.withArgs(SquadLogKind.Orchestration, "o.md").resolves(
      squadOk({ relativePath: ".squad/orchestration-log/o.md", content: "oc", sizeBytes: 1, truncated: false })
    );
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

  test("saveSquadCharter emits loading and a sanitized save result", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadCharter", agentId: "link", content: "# Charter" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadCharterSaved", "squadLoading"]);
    assert.ok(stubs.saveCharter.calledOnceWithExactly("link", "# Charter"));
    const saved = find("squadCharterSaved");
    assert.ok(saved);
    assert.strictEqual(saved.charter.agentId, "link");
    assert.deepStrictEqual(saved.result, {
      relativePath: ".squad/agents/link/charter.md",
      created: false,
      backupCreated: true,
      bytesWritten: 9,
    });
  });

  test("saveSquadDoc emits loading and a sanitized save result", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadDoc", kind: SquadDocKind.Decisions, content: "# Decisions" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadDocSaved", "squadLoading"]);
    assert.ok(stubs.saveMarkdownDoc.calledOnceWithExactly(SquadDocKind.Decisions, "# Decisions"));
    const saved = find("squadDocSaved");
    assert.ok(saved);
    assert.strictEqual(saved.doc.kind, SquadDocKind.Decisions);
    assert.strictEqual(saved.result.backupCreated, true);
  });

  test("saveSquadCharter emits an actionable error when no workspace writer is available", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs, false));

    await handler.handleMessage({ command: "saveSquadCharter", agentId: "link", content: "x" });

    assert.deepStrictEqual(commands(), ["squadError"]);
    assert.strictEqual(find("squadError")?.error.code, "not-a-workspace");
    assert.ok(stubs.saveCharter.notCalled);
  });

  test("saveSquadDoc surfaces write failures and clears loading", async () => {
    const stubs = createStubs();
    stubs.saveMarkdownDoc.resolves(
      squadErr({ code: "backup-failed", message: "backup failed", remediation: "check disk" })
    );
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadDoc", kind: SquadDocKind.Routing, content: "# Routing" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadError", "squadLoading"]);
    assert.strictEqual(find("squadError")?.error.code, "backup-failed");
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
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

  test("unknown command is ignored without posting a message", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "notARealCommand" } as unknown as never);

    assert.strictEqual(posted.length, 0);
  });
});
