/**
 * Tests for SquadUpstreamMessageHandler (SQD-036 / #251): webview message
 * contract for `squad upstream list | add | sync | remove`.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { SquadUpstreamMessageHandler } from "../../src/features/panel-ui/squadUpstreamMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import {
  SquadUpstreamKind,
  SquadUpstreamOperation,
  squadErr,
  squadOk,
  type SquadUpstreamSource,
} from "../../src/features/squad/models";

const ROOT = vscode.Uri.file("/tmp/workspace");
const ORG: SquadUpstreamSource = { id: "org", kind: SquadUpstreamKind.Git, reference: "https://github.com/org/org.git" };

interface UpstreamStubs {
  list: sinon.SinonStub;
  add: sinon.SinonStub;
  sync: sinon.SinonStub;
  remove: sinon.SinonStub;
  readUpstreams: sinon.SinonStub;
}

function createHandler(hasWorkspace = true): {
  handler: SquadUpstreamMessageHandler;
  stubs: UpstreamStubs;
  posted: ExtensionMessage[];
} {
  const root = hasWorkspace ? ROOT : undefined;
  const outcome = (operation: string, name?: string) =>
    squadOk({ operation, name, upstreams: [ORG], backupPath: null, output: [] });
  const stubs: UpstreamStubs = {
    list: sinon.stub().resolves(outcome(SquadUpstreamOperation.List)),
    add: sinon.stub().resolves(outcome(SquadUpstreamOperation.Add, "org")),
    sync: sinon.stub().resolves(outcome(SquadUpstreamOperation.Sync)),
    remove: sinon.stub().resolves(outcome(SquadUpstreamOperation.Remove, "org")),
    readUpstreams: sinon.stub().resolves(squadOk([ORG])),
  };
  const services = {
    logging: { warn: () => undefined, error: () => undefined, info: () => undefined },
    squadUpstream: stubs,
  } as unknown as ServiceContainer;
  const posted: ExtensionMessage[] = [];
  const handler = new SquadUpstreamMessageHandler(
    services,
    (message) => posted.push(message),
    () => root
  );
  return { handler, stubs, posted };
}

suite("Unit: SquadUpstreamMessageHandler (SQD-036)", () => {
  test("ignores non-upstream commands", async () => {
    const { handler, posted } = createHandler();
    assert.strictEqual(await handler.handle({ command: "getSquadState" }), false);
    assert.strictEqual(posted.length, 0);
  });

  test("listSquadUpstreams posts started then a successful result with upstreams", async () => {
    const { handler, stubs, posted } = createHandler();

    assert.strictEqual(await handler.handle({ command: "listSquadUpstreams" }), true);

    sinon.assert.calledOnceWithExactly(stubs.list, ROOT);
    assert.deepStrictEqual(posted[0], { command: "squadUpstreamOperationStarted", operation: "list", name: undefined });
    assert.deepStrictEqual(posted[1], {
      command: "squadUpstreamOperationResult",
      operation: "list",
      name: undefined,
      ok: true,
      upstreams: [ORG],
    });
  });

  test("addSquadUpstream forwards source, name and ref", async () => {
    const { handler, stubs, posted } = createHandler();

    await handler.handle({ command: "addSquadUpstream", source: "org/org", name: "org", ref: "main" });

    sinon.assert.calledOnceWithExactly(stubs.add, ROOT, { source: "org/org", name: "org", ref: "main" });
    const result = posted[1];
    assert.ok(result.command === "squadUpstreamOperationResult" && result.ok && result.name === "org");
  });

  test("syncSquadUpstream forwards the optional name", async () => {
    const { handler, stubs } = createHandler();
    await handler.handle({ command: "syncSquadUpstream" });
    await handler.handle({ command: "syncSquadUpstream", name: "org" });
    assert.deepStrictEqual(stubs.sync.firstCall.args, [ROOT, undefined]);
    assert.deepStrictEqual(stubs.sync.secondCall.args, [ROOT, "org"]);
  });

  test("removeSquadUpstream forwards the name", async () => {
    const { handler, stubs } = createHandler();
    await handler.handle({ command: "removeSquadUpstream", name: "org" });
    sinon.assert.calledOnceWithExactly(stubs.remove, ROOT, "org");
  });

  test("a failure posts ok:false with the actionable error and the re-read upstreams", async () => {
    const { handler, stubs, posted } = createHandler();
    stubs.sync.resolves(
      squadErr({
        code: "upstream-failed",
        message: "Some Squad upstreams failed to sync (1/2 synced).",
        remediation: "Check the sources.",
        cause: new Error("internal"),
      })
    );

    await handler.handle({ command: "syncSquadUpstream" });

    const result = posted[1];
    assert.strictEqual(result.command, "squadUpstreamOperationResult");
    if (result.command !== "squadUpstreamOperationResult") {
      return;
    }
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, "upstream-failed");
    assert.strictEqual(result.error?.remediation, "Check the sources.");
    assert.strictEqual((result.error as { cause?: unknown }).cause, undefined, "cause must not be posted");
    assert.deepStrictEqual(result.upstreams, [ORG], "partial changes stay visible");
    sinon.assert.calledOnce(stubs.readUpstreams);
  });

  test("an unexpected exception becomes an ok:false result, never a silent success", async () => {
    const { handler, stubs, posted } = createHandler();
    stubs.remove.rejects(new Error("kaboom"));

    await handler.handle({ command: "removeSquadUpstream", name: "org" });

    const result = posted[1];
    assert.ok(result.command === "squadUpstreamOperationResult" && !result.ok && result.error?.code === "unknown");
  });

  test("without a workspace the service error is posted and upstreams are empty", async () => {
    const { handler, stubs, posted } = createHandler(false);
    stubs.list.resolves(squadErr({ code: "not-a-workspace", message: "Open a folder." }));

    await handler.handle({ command: "listSquadUpstreams" });

    const result = posted[1];
    assert.ok(result.command === "squadUpstreamOperationResult" && !result.ok);
    if (result.command === "squadUpstreamOperationResult") {
      assert.deepStrictEqual(result.upstreams, []);
    }
    sinon.assert.notCalled(stubs.readUpstreams);
  });
});
