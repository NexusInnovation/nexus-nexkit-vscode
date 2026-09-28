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
  SquadUpdatesResult,
  SquadUpdateTarget,
  SquadUpgradeCommand,
  squadErr,
  squadOk,
  SquadVersionStatus,
} from "../../src/features/squad/models";
import { SquadLogKind } from "../../src/features/squad/services/squadFileService";

const VALID_MODEL_CONFIG_JSON = '{ "default": "gpt-5.6-terra", "overrides": { "link": "claude-opus-5.5" } }';
const VALID_MODEL_CONFIG = {
  defaultModel: "gpt-5.6-terra",
  overrides: [{ agentId: "link", model: "claude-opus-5.5" }],
};

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
  readModelConfig: sinon.SinonStub;
  saveModelConfig: sinon.SinonStub;
  readMarketplaces: sinon.SinonStub;
  listInstalledPlugins: sinon.SinonStub;
  runDoctor: sinon.SinonStub;
  checkUpdates: sinon.SinonStub;
  exportSquad: sinon.SinonStub;
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
    readModelConfig: sinon.stub().resolves(
      squadOk({
        document: {
          relativePath: ".squad/model-config.json",
          exists: true,
          content: VALID_MODEL_CONFIG_JSON,
          config: VALID_MODEL_CONFIG,
        },
      })
    ),
    saveModelConfig: sinon.stub().resolves(
      squadOk({
        relativePath: ".squad/model-config.json",
        created: false,
        backupPath: "C:/abs/backup",
        bytesWritten: VALID_MODEL_CONFIG_JSON.length,
        document: {
          relativePath: ".squad/model-config.json",
          exists: true,
          content: VALID_MODEL_CONFIG_JSON,
          config: VALID_MODEL_CONFIG,
        },
      })
    ),
    readMarketplaces: sinon.stub().resolves(squadOk([])),
    listInstalledPlugins: sinon.stub().resolves(squadOk([])),
    runDoctor: sinon.stub(),
    checkUpdates: sinon.stub().resolves(squadOk(updatesResult())),
    exportSquad: sinon.stub(),
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
        readModelConfig: stubs.readModelConfig,
      }
    : undefined;
  const squadWrite = hasWorkspace
    ? {
        saveCharter: stubs.saveCharter,
        saveMarkdownDoc: stubs.saveMarkdownDoc,
        saveModelConfig: stubs.saveModelConfig,
      }
    : undefined;
  const squadPlugins = hasWorkspace
    ? {
        readMarketplaces: stubs.readMarketplaces,
        listInstalledPlugins: stubs.listInstalledPlugins,
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
    squadExport: {
      exportSquad: stubs.exportSquad,
    },
    squadFile,
    squadWrite,
    squadPlugins,
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
    assert.deepStrictEqual(status.marketplaces, []);
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

  test("getSquadState includes plugin marketplaces and installed plugins", async () => {
    const stubs = createStubs();
    stubs.readMarketplaces.resolves(
      squadOk([{ id: "core", source: "NexusInnovation/nexus-plugin-marketplace", kind: "github", enabled: true }])
    );
    stubs.listInstalledPlugins.resolves(squadOk([{ id: "team-plugin", marketplace: "core", enabled: true, status: "enabled" }]));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "getSquadState" });

    const status = find("squadStatusUpdate");
    assert.strictEqual(status?.marketplaces.length, 1);
    assert.strictEqual(status?.plugins[0].id, "team-plugin");
  });

  test("refreshSquadPlugins emits plugin inventory and clears loading", async () => {
    const stubs = createStubs();
    stubs.readMarketplaces.resolves(
      squadOk([{ id: "core", source: "NexusInnovation/nexus-plugin-marketplace", kind: "github", enabled: true }])
    );
    stubs.listInstalledPlugins.resolves(squadOk([{ id: "greffondors", enabled: false, status: "disabled" }]));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "refreshSquadPlugins" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadPluginsUpdate", "squadLoading"]);
    const update = find("squadPluginsUpdate");
    assert.strictEqual(update?.marketplaces[0].id, "core");
    assert.strictEqual(update?.plugins[0].enabled, false);
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("refreshSquadPlugins surfaces plugin read failures after the inventory response", async () => {
    const stubs = createStubs();
    stubs.listInstalledPlugins.resolves(
      squadErr({ code: "plugin-list-failed", message: "bad json", remediation: "Update Squad CLI." })
    );
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "refreshSquadPlugins" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadPluginsUpdate", "squadError", "squadLoading"]);
    assert.strictEqual(find("squadError")?.error.code, "plugin-list-failed");
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

  test("refreshSquadDetection surfaces upstream read errors after status update", async () => {
    const stubs = createStubs();
    stubs.readUpstreams.resolves(squadErr({ code: "parse-failed", message: "bad upstreams" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "refreshSquadDetection" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadStatusUpdate", "squadError", "squadLoading"]);
    assert.strictEqual(find("squadError")?.error.code, "parse-failed");
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("saveSquadDoc emits loading and a sanitized save result", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadDoc", kind: SquadDocKind.Decisions, content: "# Decisions" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadDocSaved", "squadLoading"]);
    assert.ok(
      stubs.saveMarkdownDoc.calledOnceWithExactly(SquadDocKind.Decisions, "# Decisions", {
        baseContentHash: undefined,
      })
    );
    const saved = find("squadDocSaved");
    assert.ok(saved);
    assert.strictEqual(saved.doc.kind, SquadDocKind.Decisions);
    assert.strictEqual(saved.result.backupCreated, true);
  });

  test("saveSquadDoc forwards baseContentHash for stale-write detection (SQD-027)", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({
      command: "saveSquadDoc",
      kind: SquadDocKind.Routing,
      content: "# Routing",
      baseContentHash: "abc123",
    });

    assert.ok(
      stubs.saveMarkdownDoc.calledOnceWithExactly(SquadDocKind.Routing, "# Routing", { baseContentHash: "abc123" })
    );
  });

  test("saveSquadDoc surfaces write-conflict as an actionable error, never a saved result", async () => {
    const stubs = createStubs();
    stubs.saveMarkdownDoc.resolves(
      squadErr({
        code: "write-conflict",
        message: ".squad/decisions.md changed on disk since you opened it, so your edit was not saved.",
        remediation: "Refresh the Squad panel and re-apply your edit.",
      })
    );
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({
      command: "saveSquadDoc",
      kind: SquadDocKind.Decisions,
      content: "# Decisions",
      baseContentHash: "stale",
    });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadError", "squadLoading"]);
    const error = find("squadError");
    assert.strictEqual(error?.error.code, "write-conflict");
    assert.ok(error.error.remediation);
    assert.strictEqual(find("squadDocSaved"), undefined);
  });

  test("saveSquadDoc rejects unsupported doc kinds without calling the writer", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadDoc", kind: "team" as SquadDocKind, content: "# Team" });

    assert.deepStrictEqual(commands(), ["squadError"]);
    assert.strictEqual(find("squadError")?.error.code, "file-write-failed");
    assert.ok(stubs.saveMarkdownDoc.notCalled);
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
    stubs.saveMarkdownDoc.resolves(squadErr({ code: "backup-failed", message: "backup failed", remediation: "check disk" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadDoc", kind: SquadDocKind.Routing, content: "# Routing" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadError", "squadLoading"]);
    assert.strictEqual(find("squadError")?.error.code, "backup-failed");
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("getSquadState emits squadModelConfigUpdate with the validated model config", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "getSquadState" });

    const update = find("squadModelConfigUpdate");
    assert.ok(update, "expected squadModelConfigUpdate");
    assert.deepStrictEqual(update.modelConfig?.config, VALID_MODEL_CONFIG);
    assert.strictEqual(find("squadError"), undefined);
  });

  test("getSquadState keeps an invalid model config visible and emits a parse-failed squadError", async () => {
    const stubs = createStubs();
    const validationError = { code: "parse-failed" as const, message: "invalid", remediation: "fix it" };
    stubs.readModelConfig.resolves(
      squadOk({
        document: { relativePath: ".squad/model-config.json", exists: true, content: "{", config: null },
        validationError,
      })
    );
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "getSquadState" });

    const update = find("squadModelConfigUpdate");
    assert.strictEqual(update?.modelConfig?.content, "{");
    assert.strictEqual(update?.modelConfig?.config, null);
    assert.strictEqual(find("squadError")?.error.code, "parse-failed");
  });

  test("getSquadState surfaces model config read failures without faking a document", async () => {
    const stubs = createStubs();
    stubs.readModelConfig.resolves(squadErr({ code: "file-read-failed", message: "denied", remediation: "perms" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "getSquadState" });

    assert.strictEqual(find("squadModelConfigUpdate")?.modelConfig, null);
    assert.strictEqual(find("squadError")?.error.code, "file-read-failed");
  });

  test("saveSquadModelConfig emits loading and a sanitized save result", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadModelConfig", content: VALID_MODEL_CONFIG_JSON });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadModelConfigSaved", "squadLoading"]);
    assert.ok(stubs.saveModelConfig.calledOnceWithExactly(VALID_MODEL_CONFIG_JSON));
    const saved = find("squadModelConfigSaved");
    assert.ok(saved);
    assert.deepStrictEqual(saved.modelConfig.config, VALID_MODEL_CONFIG);
    assert.deepStrictEqual(saved.result, {
      relativePath: ".squad/model-config.json",
      created: false,
      backupCreated: true,
      bytesWritten: VALID_MODEL_CONFIG_JSON.length,
    });
    assert.ok(!("backupPath" in saved.result), "absolute backup path must not reach the webview");
  });

  test("saveSquadModelConfig surfaces validation failures and never reports success", async () => {
    const stubs = createStubs();
    stubs.saveModelConfig.resolves(
      squadErr({ code: "parse-failed", message: "not valid JSON", remediation: "fix the JSON" })
    );
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadModelConfig", content: "{" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadError", "squadLoading"]);
    assert.strictEqual(find("squadError")?.error.code, "parse-failed");
    assert.strictEqual(find("squadModelConfigSaved"), undefined);
  });

  test("saveSquadModelConfig emits not-a-workspace when no writer is available", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs, false));

    await handler.handleMessage({ command: "saveSquadModelConfig", content: VALID_MODEL_CONFIG_JSON });

    assert.deepStrictEqual(commands(), ["squadError"]);
    assert.strictEqual(find("squadError")?.error.code, "not-a-workspace");
    assert.ok(stubs.saveModelConfig.notCalled);
  });

  test("saveSquadModelConfig rejects a non-string payload without writing", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "saveSquadModelConfig", content: undefined as unknown as string });

    assert.deepStrictEqual(commands(), ["squadError"]);
    assert.strictEqual(find("squadError")?.error.code, "file-write-failed");
    assert.ok(stubs.saveModelConfig.notCalled);
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

  test("exportSquad emits squadExportResult and clears loading on success", async () => {
    const stubs = createStubs();
    const outcome = {
      target: { kind: "file" as const, uri: "file:///tmp/squad-export.json" },
      exportedAt: 123,
      stdout: "ok",
      stderr: "",
      durationMs: 10,
    };
    stubs.exportSquad.resolves(squadOk(outcome));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({
      command: "exportSquad",
      request: { target: { kind: "file", uri: "file:///tmp/squad-export.json" } },
    });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadExportResult", "squadLoading"]);
    const update = find("squadExportResult");
    assert.ok(update);
    assert.deepStrictEqual(update.export, outcome);
    assert.ok(stubs.exportSquad.calledOnce);
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("exportSquad emits squadError and clears loading on failure", async () => {
    const stubs = createStubs();
    stubs.exportSquad.resolves(squadErr({ code: "cli-execution-failed", message: "export failed", remediation: "retry" }));
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "exportSquad" });

    assert.deepStrictEqual(commands(), ["squadLoading", "squadError", "squadLoading"]);
    assert.strictEqual(find("squadError")?.error.code, "cli-execution-failed");
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("unknown command is ignored without posting a message", async () => {
    const stubs = createStubs();
    const handler = new NexkitPanelMessageHandler(getWebview, createServices(stubs));

    await handler.handleMessage({ command: "notARealCommand" } as unknown as never);

    assert.strictEqual(posted.length, 0);
  });
});
