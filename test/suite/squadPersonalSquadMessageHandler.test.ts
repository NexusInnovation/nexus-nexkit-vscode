import * as assert from "assert";
import * as sinon from "sinon";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { SquadPersonalSquadMessageHandler } from "../../src/features/panel-ui/squadPersonalSquadMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import {
  SquadConsultModeOperation,
  SquadConsultModeState,
  SquadConsultModeStatus,
  SquadPersonalSquadScope,
  SquadPersonalSquadState,
  SquadPersonalSquadStatus,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

function status(state = SquadPersonalSquadState.Initialized): SquadPersonalSquadStatus {
  return {
    state,
    scope: SquadPersonalSquadScope.Personal,
    targetLabel: "your user profile (.squad/)",
    markerRelativePath: ".squad/team.md",
    warning: "Personal Squad lives outside the current workspace.",
    roster: state === SquadPersonalSquadState.Initialized ? [{ id: "link", name: "Link", hasCharter: true }] : [],
    memberCount: state === SquadPersonalSquadState.Initialized ? 1 : 0,
  };
}

function consultStatus(state = SquadConsultModeState.Active): SquadConsultModeStatus {
  return {
    state,
    targetLabel: "this workspace (.squad/)",
    markerRelativePath: ".squad/config.json",
    warning: "Consult mode writes local .squad files.",
    excludedRelativePaths: [".squad/", ".github/agents/squad.agent.md"],
    personalStatus: status(),
  };
}

function createServices(
  getStatus: sinon.SinonStub,
  initialize: sinon.SinonStub,
  consult: Partial<{
    getStatus: sinon.SinonStub;
    startConsultMode: sinon.SinonStub;
    extractLearnings: sinon.SinonStub;
  }> = {}
): ServiceContainer {
  return {
    logging: {
      warn: () => undefined,
      error: () => undefined,
      info: () => undefined,
    },
    squadPersonal: {
      getStatus,
      initialize,
    },
    squadConsult: {
      getStatus: consult.getStatus ?? sinon.stub(),
      startConsultMode: consult.startConsultMode ?? sinon.stub(),
      extractLearnings: consult.extractLearnings ?? sinon.stub(),
    },
  } as unknown as ServiceContainer;
}

suite("Unit: SquadPersonalSquadMessageHandler (SQD-051 host routing)", () => {
  let posted: ExtensionMessage[];
  let postMessage: (message: ExtensionMessage) => void;

  setup(() => {
    posted = [];
    postMessage = (message) => posted.push(message);
  });

  function commands(): string[] {
    return posted.map((m) => m.command);
  }

  function find<T extends ExtensionMessage["command"]>(command: T): Extract<ExtensionMessage, { command: T }> | undefined {
    return posted.find((m) => m.command === command) as Extract<ExtensionMessage, { command: T }> | undefined;
  }

  test("unknown command is not handled", async () => {
    const handler = new SquadPersonalSquadMessageHandler(createServices(sinon.stub(), sinon.stub()), postMessage);

    const handled = await handler.handle({ command: "webviewReady" });

    assert.strictEqual(handled, false);
    assert.strictEqual(posted.length, 0);
  });

  test("getPersonalSquadStatus posts loading and status", async () => {
    const getStatus = sinon.stub().resolves(squadOk(status()));
    const handler = new SquadPersonalSquadMessageHandler(createServices(getStatus, sinon.stub()), postMessage);

    const handled = await handler.handle({ command: "getPersonalSquadStatus" });

    assert.strictEqual(handled, true);
    assert.deepStrictEqual(commands(), [
      "squadPersonalSquadLoading",
      "squadPersonalSquadStatusUpdate",
      "squadPersonalSquadLoading",
    ]);
    assert.strictEqual(find("squadPersonalSquadStatusUpdate")?.status.memberCount, 1);
    assert.strictEqual((posted[0] as { isLoading: boolean }).isLoading, true);
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("getPersonalSquadStatus surfaces service failures", async () => {
    const getStatus = sinon
      .stub()
      .resolves(squadErr({ code: "file-read-failed", message: "denied", remediation: "Check permissions." }));
    const handler = new SquadPersonalSquadMessageHandler(createServices(getStatus, sinon.stub()), postMessage);

    await handler.handle({ command: "getPersonalSquadStatus" });

    assert.deepStrictEqual(commands(), ["squadPersonalSquadLoading", "squadPersonalSquadError", "squadPersonalSquadLoading"]);
    assert.strictEqual(find("squadPersonalSquadError")?.error.code, "file-read-failed");
  });

  test("initPersonalSquad posts result and refreshed status on success", async () => {
    const initialize = sinon.stub().resolves(squadOk({ status: status(), alreadyInitialized: false, stdout: "ok" }));
    const handler = new SquadPersonalSquadMessageHandler(createServices(sinon.stub(), initialize), postMessage);

    const handled = await handler.handle({ command: "initPersonalSquad" });

    assert.strictEqual(handled, true);
    assert.deepStrictEqual(commands(), [
      "squadPersonalSquadLoading",
      "squadPersonalSquadInitResult",
      "squadPersonalSquadStatusUpdate",
      "squadPersonalSquadLoading",
    ]);
    assert.strictEqual(find("squadPersonalSquadInitResult")?.ok, true);
    assert.strictEqual(find("squadPersonalSquadStatusUpdate")?.status.state, SquadPersonalSquadState.Initialized);
  });

  test("initPersonalSquad surfaces initialization failures", async () => {
    const initialize = sinon.stub().resolves(squadErr({ code: "cancelled", message: "cancelled", remediation: "Try again." }));
    const handler = new SquadPersonalSquadMessageHandler(createServices(sinon.stub(), initialize), postMessage);

    await handler.handle({ command: "initPersonalSquad" });

    const result = find("squadPersonalSquadInitResult");
    assert.ok(result);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, "cancelled");
    assert.strictEqual(find("squadPersonalSquadStatusUpdate"), undefined);
  });

  test("getConsultModeStatus posts loading and status", async () => {
    const getConsultStatus = sinon.stub().resolves(squadOk(consultStatus()));
    const handler = new SquadPersonalSquadMessageHandler(
      createServices(sinon.stub(), sinon.stub(), { getStatus: getConsultStatus }),
      postMessage
    );

    const handled = await handler.handle({ command: "getConsultModeStatus" });

    assert.strictEqual(handled, true);
    assert.deepStrictEqual(commands(), ["squadConsultModeLoading", "squadConsultModeStatusUpdate", "squadConsultModeLoading"]);
    assert.strictEqual(find("squadConsultModeStatusUpdate")?.status.state, SquadConsultModeState.Active);
  });

  test("startSquadConsultMode posts result and refreshed status on success", async () => {
    const startConsultMode = sinon.stub().resolves(
      squadOk({
        operation: SquadConsultModeOperation.Consult,
        status: consultStatus(),
        backupPath: null,
        stdout: "ok",
      })
    );
    const handler = new SquadPersonalSquadMessageHandler(
      createServices(sinon.stub(), sinon.stub(), { startConsultMode }),
      postMessage
    );

    const handled = await handler.handle({ command: "startSquadConsultMode" });

    assert.strictEqual(handled, true);
    assert.deepStrictEqual(commands(), [
      "squadConsultModeLoading",
      "squadConsultModeResult",
      "squadConsultModeStatusUpdate",
      "squadConsultModeLoading",
    ]);
    assert.strictEqual(find("squadConsultModeResult")?.operation, SquadConsultModeOperation.Consult);
    assert.strictEqual(find("squadConsultModeResult")?.ok, true);
  });

  test("extractSquadConsultMode surfaces extraction failures", async () => {
    const extractLearnings = sinon
      .stub()
      .resolves(squadErr({ code: "cli-execution-failed", message: "failed", remediation: "Retry." }));
    const handler = new SquadPersonalSquadMessageHandler(
      createServices(sinon.stub(), sinon.stub(), { extractLearnings }),
      postMessage
    );

    await handler.handle({ command: "extractSquadConsultMode" });

    const result = find("squadConsultModeResult");
    assert.ok(result);
    assert.strictEqual(result.operation, SquadConsultModeOperation.Extract);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, "cli-execution-failed");
    assert.strictEqual(find("squadConsultModeStatusUpdate"), undefined);
  });
});
