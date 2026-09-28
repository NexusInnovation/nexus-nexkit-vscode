/**
 * Tests for SquadPluginActionMessageHandler (SQD-039): routing of
 * `runSquadPluginAction`, operand prompting, result/error messages and
 * inventory refresh after successful writes.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import { ServiceContainer } from "../../src/core/serviceContainer";
import {
  SquadPluginActionMessageHandler,
  SquadPluginActionPrompts,
} from "../../src/features/panel-ui/squadPluginActionMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import { SquadPluginAction, squadErr, squadOk } from "../../src/features/squad/models";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

interface HandlerHarness {
  handler: SquadPluginActionMessageHandler;
  messages: ExtensionMessage[];
  runAction: sinon.SinonStub;
  readMarketplaces: sinon.SinonStub;
  listInstalledPlugins: sinon.SinonStub;
  prompts: { askMarketplaceSource: sinon.SinonStub; pickPluginDirectory: sinon.SinonStub };
}

function createHarness(options: { withActions?: boolean } = {}): HandlerHarness {
  const messages: ExtensionMessage[] = [];
  const runAction = sinon.stub();
  const readMarketplaces = sinon.stub().resolves(squadOk([{ id: "core", source: "acme/core", kind: "github", enabled: true }]));
  const listInstalledPlugins = sinon.stub().resolves(squadOk([{ id: "team", enabled: true }]));
  const prompts = {
    askMarketplaceSource: sinon.stub().resolves(undefined),
    pickPluginDirectory: sinon.stub().resolves(undefined),
  };
  const services = {
    logging: silentLogger,
    squadPlugins: { readMarketplaces, listInstalledPlugins },
    squadPluginActions: options.withActions === false ? undefined : { runAction },
  } as unknown as ServiceContainer;
  const handler = new SquadPluginActionMessageHandler(
    services,
    (message) => messages.push(message),
    prompts as SquadPluginActionPrompts
  );
  return { handler, messages, runAction, readMarketplaces, listInstalledPlugins, prompts };
}

function ofCommand<C extends ExtensionMessage["command"]>(
  messages: ExtensionMessage[],
  command: C
): Extract<ExtensionMessage, { command: C }>[] {
  return messages.filter((m): m is Extract<ExtensionMessage, { command: C }> => m.command === command);
}

suite("Unit: SquadPluginActionMessageHandler", () => {
  test("ignores unrelated commands", async () => {
    const h = createHarness();
    assert.strictEqual(await h.handler.handle({ command: "refreshSquadPlugins" }), false);
    assert.strictEqual(h.messages.length, 0);
  });

  test("successful write posts a result, then refreshes the plugin inventory", async () => {
    const h = createHarness();
    h.runAction.resolves(
      squadOk({ action: SquadPluginAction.Enable, target: "team", changed: true, backedUp: true, output: "Enabled plugin team" })
    );

    const handled = await h.handler.handle({ command: "runSquadPluginAction", action: SquadPluginAction.Enable, target: "team" });

    assert.strictEqual(handled, true);
    sinon.assert.calledOnceWithExactly(h.runAction, { action: SquadPluginAction.Enable, target: "team" });
    const [result] = ofCommand(h.messages, "squadPluginActionResult");
    assert.deepStrictEqual(result, {
      command: "squadPluginActionResult",
      action: SquadPluginAction.Enable,
      target: "team",
      ok: true,
      changed: true,
      output: "Enabled plugin team",
    });
    const [update] = ofCommand(h.messages, "squadPluginsUpdate");
    assert.strictEqual(update.marketplaces[0].id, "core");
    assert.strictEqual(update.plugins[0].id, "team");
    assert.strictEqual(ofCommand(h.messages, "squadError").length, 0);
    const loading = ofCommand(h.messages, "squadLoading").map((m) => m.isLoading);
    assert.deepStrictEqual(loading, [true, false]);
  });

  test("read-only actions do not refresh the inventory", async () => {
    const h = createHarness();
    h.runAction.resolves(
      squadOk({ action: SquadPluginAction.Validate, target: "./p", changed: false, backedUp: false, output: "valid" })
    );

    await h.handler.handle({ command: "runSquadPluginAction", action: SquadPluginAction.Validate, target: "./p" });

    assert.strictEqual(ofCommand(h.messages, "squadPluginsUpdate").length, 0);
    assert.strictEqual(ofCommand(h.messages, "squadPluginActionResult")[0].output, "valid");
  });

  test("failures post ok:false with the error and a visible squadError", async () => {
    const h = createHarness();
    const error = { code: "plugin-action-failed" as const, message: "Install plugin failed.", remediation: "Fix it." };
    h.runAction.resolves(squadErr(error));

    await h.handler.handle({ command: "runSquadPluginAction", action: SquadPluginAction.Install, target: "./p" });

    const [result] = ofCommand(h.messages, "squadPluginActionResult");
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.error, error);
    assert.deepStrictEqual(ofCommand(h.messages, "squadError")[0].error, error);
    assert.strictEqual(ofCommand(h.messages, "squadPluginsUpdate").length, 0);
  });

  test("a user cancellation is reported in the result but not as a squadError banner", async () => {
    const h = createHarness();
    h.runAction.resolves(squadErr({ code: "cancelled", message: "Cancelled." }));

    await h.handler.handle({ command: "runSquadPluginAction", action: SquadPluginAction.Uninstall, target: "team" });

    assert.strictEqual(ofCommand(h.messages, "squadPluginActionResult")[0].error?.code, "cancelled");
    assert.strictEqual(ofCommand(h.messages, "squadError").length, 0);
  });

  test("prompts for a marketplace source when none is supplied", async () => {
    const h = createHarness();
    h.prompts.askMarketplaceSource.resolves("acme/plugins");
    h.runAction.resolves(
      squadOk({ action: SquadPluginAction.AddMarketplace, target: "acme/plugins", changed: true, backedUp: false, output: "" })
    );

    await h.handler.handle({ command: "runSquadPluginAction", action: SquadPluginAction.AddMarketplace });

    sinon.assert.calledOnce(h.prompts.askMarketplaceSource);
    sinon.assert.calledOnceWithExactly(h.runAction, { action: SquadPluginAction.AddMarketplace, target: "acme/plugins" });
  });

  test("prompts for a plugin folder and cancels cleanly when dismissed", async () => {
    const h = createHarness();

    await h.handler.handle({ command: "runSquadPluginAction", action: SquadPluginAction.Install });

    sinon.assert.calledOnce(h.prompts.pickPluginDirectory);
    sinon.assert.notCalled(h.runAction);
    const [result] = ofCommand(h.messages, "squadPluginActionResult");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, "cancelled");
  });

  test("the Nexus marketplace action needs no prompt", async () => {
    const h = createHarness();
    h.runAction.resolves(
      squadOk({
        action: SquadPluginAction.AddNexusMarketplace,
        target: "NexusInnovation/nexus-plugin-marketplace",
        changed: true,
        backedUp: true,
        output: "",
      })
    );

    await h.handler.handle({ command: "runSquadPluginAction", action: SquadPluginAction.AddNexusMarketplace });

    sinon.assert.notCalled(h.prompts.askMarketplaceSource);
    sinon.assert.calledOnceWithExactly(h.runAction, { action: SquadPluginAction.AddNexusMarketplace, target: undefined });
  });

  test("reports not-a-workspace when plugin actions are unavailable", async () => {
    const h = createHarness({ withActions: false });

    await h.handler.handle({ command: "runSquadPluginAction", action: SquadPluginAction.Enable, target: "team" });

    const [result] = ofCommand(h.messages, "squadPluginActionResult");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error?.code, "not-a-workspace");
    assert.strictEqual(ofCommand(h.messages, "squadError").length, 1);
  });

  test("an unexpected exception still ends in an actionable failure", async () => {
    const h = createHarness();
    h.runAction.rejects(new Error("boom"));

    await h.handler.handle({ command: "runSquadPluginAction", action: SquadPluginAction.Disable, target: "team" });

    assert.strictEqual(ofCommand(h.messages, "squadPluginActionResult")[0].error?.code, "plugin-action-failed");
    assert.deepStrictEqual(
      ofCommand(h.messages, "squadLoading").map((m) => m.isLoading),
      [true, false]
    );
  });
});
