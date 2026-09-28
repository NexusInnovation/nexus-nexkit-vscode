import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";
import {
  SquadCliSetupMessageHandler,
  SQUAD_CLI_INSTALL_COMMAND,
} from "../../src/features/panel-ui/squadCliSetupMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import { SquadCliSource } from "../../src/features/squad/models";

suite("Unit: SquadCliSetupMessageHandler (SQD-025)", () => {
  let sandbox: sinon.SinonSandbox;
  let posted: ExtensionMessage[];
  let redetect: sinon.SinonStub;
  let setSource: sinon.SinonStub;
  let setPath: sinon.SinonStub;
  let handler: SquadCliSetupMessageHandler;

  setup(() => {
    sandbox = sinon.createSandbox();
    posted = [];
    redetect = sandbox.stub().resolves();
    setSource = sandbox.stub(SettingsManager, "setSquadCliSource").resolves();
    setPath = sandbox.stub(SettingsManager, "setSquadCliPath").resolves();
    handler = new SquadCliSetupMessageHandler((message) => posted.push(message), redetect);
  });

  teardown(() => {
    sandbox.restore();
  });

  function find<T extends ExtensionMessage["command"]>(command: T): Extract<ExtensionMessage, { command: T }> | undefined {
    return posted.find((m) => m.command === command) as Extract<ExtensionMessage, { command: T }> | undefined;
  }

  test("returns false for unrelated commands", async () => {
    const handled = await handler.handle({ command: "getSquadState" });
    assert.strictEqual(handled, false);
    assert.ok(setSource.notCalled);
    assert.ok(redetect.notCalled);
  });

  test("setSquadCliInvocation npx persists source and re-runs detection", async () => {
    const handled = await handler.handle({ command: "setSquadCliInvocation", source: SquadCliSource.Npx });

    assert.strictEqual(handled, true);
    assert.ok(setSource.calledOnceWithExactly(SquadCliSource.Npx));
    assert.ok(setPath.notCalled, "npx must not write a custom path");
    assert.ok(redetect.calledOnce);
    assert.strictEqual(find("squadError"), undefined);
  });

  test("setSquadCliInvocation custom persists path then source", async () => {
    const handled = await handler.handle({
      command: "setSquadCliInvocation",
      source: SquadCliSource.Custom,
      cliPath: "  /opt/squad/bin/squad  ",
    });

    assert.strictEqual(handled, true);
    assert.ok(setPath.calledOnceWithExactly("/opt/squad/bin/squad"), "path is trimmed before persisting");
    assert.ok(setSource.calledOnceWithExactly(SquadCliSource.Custom));
    assert.ok(setPath.calledBefore(setSource));
    assert.ok(redetect.calledOnce);
  });

  test("setSquadCliInvocation custom with blank path errors and skips persistence", async () => {
    const handled = await handler.handle({
      command: "setSquadCliInvocation",
      source: SquadCliSource.Custom,
      cliPath: "   ",
    });

    assert.strictEqual(handled, true);
    assert.ok(setPath.notCalled);
    assert.ok(setSource.notCalled);
    assert.ok(redetect.notCalled);
    const error = find("squadError");
    assert.ok(error, "expected a squadError");
    assert.strictEqual(error.error.code, "cli-not-found");
    assert.ok(error.error.remediation, "error must be actionable");
  });

  test("setSquadCliInvocation surfaces a squadError when persistence throws", async () => {
    setSource.rejects(new Error("settings locked"));

    await handler.handle({ command: "setSquadCliInvocation", source: SquadCliSource.Global });

    const error = find("squadError");
    assert.ok(error);
    assert.strictEqual(error.error.code, "unknown");
    assert.ok(redetect.notCalled);
  });

  test("installSquadCli opens a terminal after confirmation, sets global source, re-detects", async () => {
    const sendText = sandbox.stub();
    const show = sandbox.stub();
    const createTerminal = sandbox
      .stub(vscode.window, "createTerminal")
      .returns({ sendText, show } as unknown as vscode.Terminal);
    const showWarning = sandbox
      .stub(vscode.window, "showWarningMessage")
      .resolves("Install with npm" as unknown as vscode.MessageItem);

    const handled = await handler.handle({ command: "installSquadCli" });

    assert.strictEqual(handled, true);
    assert.ok(showWarning.calledOnce, "must confirm before installing");
    assert.ok(createTerminal.calledOnce);
    assert.ok(sendText.calledOnceWithExactly(SQUAD_CLI_INSTALL_COMMAND));
    assert.ok(show.calledOnce);
    assert.ok(setSource.calledOnceWithExactly(SquadCliSource.Global));
    assert.ok(redetect.calledOnce);
  });

  test("installSquadCli does nothing when the user cancels the confirmation", async () => {
    const createTerminal = sandbox.stub(vscode.window, "createTerminal");
    const showWarning = sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);

    await handler.handle({ command: "installSquadCli" });

    assert.ok(showWarning.calledOnce);
    assert.ok(createTerminal.notCalled, "no terminal without confirmation");
    assert.ok(setSource.notCalled);
    assert.ok(redetect.notCalled);
    assert.strictEqual(find("squadError"), undefined);
  });

  test("installSquadCli surfaces a squadError when the terminal cannot be created", async () => {
    sandbox
      .stub(vscode.window, "showWarningMessage")
      .resolves("Install with npm" as unknown as vscode.MessageItem);
    sandbox.stub(vscode.window, "createTerminal").throws(new Error("no terminal"));

    await handler.handle({ command: "installSquadCli" });

    const error = find("squadError");
    assert.ok(error);
    assert.strictEqual(error.error.code, "unknown");
    assert.ok(error.error.remediation?.includes(SQUAD_CLI_INSTALL_COMMAND));
    assert.ok(redetect.notCalled);
  });
});
