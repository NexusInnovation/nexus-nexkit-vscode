import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { SquadCeremonyMessageHandler } from "../../src/features/panel-ui/squadCeremonyMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import { SQUAD_CEREMONIES_RELATIVE_PATH, squadErr, squadOk } from "../../src/features/squad/models";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function ofCommand<C extends ExtensionMessage["command"]>(
  messages: ExtensionMessage[],
  command: C
): Extract<ExtensionMessage, { command: C }>[] {
  return messages.filter((message): message is Extract<ExtensionMessage, { command: C }> => message.command === command);
}

function createHarness() {
  const messages: ExtensionMessage[] = [];
  const readCeremonies = sinon.stub().resolves(
    squadOk({
      relativePath: SQUAD_CEREMONIES_RELATIVE_PATH,
      exists: true,
      ceremonies: [{ id: "standup", name: "Standup", enabled: true, agenda: ["Sync"] }],
      truncated: false,
    })
  );
  const execute = sinon.stub().resolves(undefined);
  const services = {
    logging: silentLogger,
    squadFile: { readCeremonies },
  } as unknown as ServiceContainer;
  const handler = new SquadCeremonyMessageHandler(
    services,
    (message) => messages.push(message),
    () => vscode.Uri.file("C:\\workspace"),
    execute
  );
  return { handler, messages, readCeremonies, execute };
}

suite("Unit: SquadCeremonyMessageHandler (SQD-047)", () => {
  test("ignores unrelated commands", async () => {
    const h = createHarness();
    assert.strictEqual(await h.handler.handle({ command: "getSquadState" }), false);
    assert.strictEqual(h.messages.length, 0);
  });

  test("getSquadCeremonies posts loading and a ceremony update", async () => {
    const h = createHarness();

    assert.strictEqual(await h.handler.handle({ command: "getSquadCeremonies" }), true);

    assert.deepStrictEqual(
      ofCommand(h.messages, "squadCeremoniesLoading").map((message) => message.isLoading),
      [true, false]
    );
    const [update] = ofCommand(h.messages, "squadCeremoniesUpdate");
    assert.strictEqual(update.ceremonies.ceremonies[0].id, "standup");
  });

  test("getSquadCeremonies posts actionable errors without a success update", async () => {
    const h = createHarness();
    h.readCeremonies.resolves(squadErr({ code: "file-read-failed", message: "Cannot read.", remediation: "Fix it." }));

    await h.handler.handle({ command: "getSquadCeremonies" });

    assert.strictEqual(ofCommand(h.messages, "squadCeremoniesUpdate").length, 0);
    assert.strictEqual(ofCommand(h.messages, "squadCeremoniesError")[0].error.message, "Cannot read.");
  });

  test("runSquadCeremony posts started then ok:true", async () => {
    const h = createHarness();

    assert.strictEqual(await h.handler.handle({ command: "runSquadCeremony", ceremonyId: "standup" }), true);

    assert.deepStrictEqual(h.messages[0], { command: "squadCeremonyActionStarted", ceremonyId: "standup" });
    assert.deepStrictEqual(h.messages[h.messages.length - 1], {
      command: "squadCeremonyActionResult",
      ceremonyId: "standup",
      ok: true,
    });
  });

  test("runSquadCeremony posts ok:false with a serializable error", async () => {
    const h = createHarness();
    h.execute.rejects(new Error("chat failed"));

    await h.handler.handle({ command: "runSquadCeremony", ceremonyId: "standup" });

    const [result] = ofCommand(h.messages, "squadCeremonyActionResult");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.ok ? undefined : result.error?.code, "ceremony-failed");
    assert.strictEqual(result.ok ? undefined : (result.error as { cause?: unknown }).cause, undefined);
  });

  test("openSquadCeremonies forwards opening failures as ceremony errors", async () => {
    const h = createHarness();
    h.execute.rejects(new Error("open failed"));

    assert.strictEqual(await h.handler.handle({ command: "openSquadCeremonies" }), true);

    assert.strictEqual(ofCommand(h.messages, "squadCeremoniesError")[0].error.code, "file-read-failed");
  });
});
