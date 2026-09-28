/**
 * useSquadState (SQD-007) — selectors + action message plumbing.
 *
 * Verifies each action posts exactly the message the host expects (with its
 * payload). Preset selection is covered by useSquadPresets; this suite only
 * asserts the host messages exposed by the Squad state hook.
 */

import * as assert from "assert";
import { useSquadState } from "../../../src/features/panel-ui/webview/hooks/useSquadState";
import { SquadCliSource, SquadPluginAction } from "../../../src/features/squad/models";
import { renderWithAppState, fireEvent, cleanup } from "./harness/renderSquad";
import { lastPostedMessage, postedMessagesOfCommand, resetVsCodeApiMock } from "./harness/vscodeApiMock";

function ActionProbe() {
  const squad = useSquadState();
  return (
    <div>
      <button data-testid="refresh" onClick={() => squad.refresh()} />
      <button data-testid="refresh-detection" onClick={() => squad.refreshDetection()} />
      <button data-testid="save-charter" onClick={() => squad.saveCharter("trinity", "# Charter")} />
      <button data-testid="save-doc" onClick={() => squad.saveDoc("decisions", "# Decisions")} />
      <button data-testid="save-model-config" onClick={() => squad.saveModelConfig('{ "default": "m" }')} />
      <button data-testid="save-doc-hash" onClick={() => squad.saveDoc("routing", "# Routing", "abc123")} />
      <button data-testid="save-doc-new" onClick={() => squad.saveDoc("routing", "# Routing", null)} />
      <button data-testid="run-doctor" onClick={() => squad.runDoctor()} />
      <button data-testid="check-updates" onClick={() => squad.checkUpdates()} />
      <button data-testid="refresh-plugins" onClick={() => squad.refreshPlugins()} />
      <button data-testid="plugin-enable" onClick={() => squad.runPluginAction(SquadPluginAction.Enable, "team")} />
      <button data-testid="plugin-add-nexus" onClick={() => squad.runPluginAction(SquadPluginAction.AddNexusMarketplace)} />
      <button data-testid="install-cli" onClick={() => squad.installCli()} />
      <button data-testid="upgrade-project" onClick={() => squad.upgradeProject()} />
      <button data-testid="use-npx" onClick={() => squad.setCliInvocation(SquadCliSource.Npx)} />
      <button data-testid="use-custom" onClick={() => squad.setCliInvocation(SquadCliSource.Custom, "/opt/squad")} />
      <button data-testid="list-upstreams" onClick={() => squad.listUpstreams()} />
      <button data-testid="add-upstream" onClick={() => squad.addUpstream("org/repo", "org", "main")} />
      <button data-testid="sync-upstream" onClick={() => squad.syncUpstream("org")} />
      <button data-testid="remove-upstream" onClick={() => squad.removeUpstream("org")} />
    </div>
  );
}

function click(view: ReturnType<typeof renderWithAppState>, testId: string): void {
  fireEvent.click(view.getByTestId(testId));
}

suite("useSquadState — actions", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("refresh posts getSquadState", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "refresh");
    assert.deepStrictEqual(lastPostedMessage(), { command: "getSquadState" });
  });

  test("refreshDetection posts refreshSquadDetection", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "refresh-detection");
    assert.deepStrictEqual(lastPostedMessage(), { command: "refreshSquadDetection" });
  });

  test("saveCharter posts saveSquadCharter with agent id and content", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "save-charter");
    assert.deepStrictEqual(lastPostedMessage(), {
      command: "saveSquadCharter",
      agentId: "trinity",
      content: "# Charter",
    });
  });

  test("saveDoc posts saveSquadDoc with kind and content", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "save-doc");
    assert.deepStrictEqual(lastPostedMessage(), {
      command: "saveSquadDoc",
      kind: "decisions",
      content: "# Decisions",
    });
  });

  test("saveModelConfig posts saveSquadModelConfig with the raw JSON content", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "save-model-config");
    assert.deepStrictEqual(lastPostedMessage(), {
      command: "saveSquadModelConfig",
      content: '{ "default": "m" }',
    });
  });

  test("saveDoc forwards the baseContentHash for stale-write detection (SQD-027)", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "save-doc-hash");
    assert.deepStrictEqual(lastPostedMessage(), {
      command: "saveSquadDoc",
      kind: "routing",
      content: "# Routing",
      baseContentHash: "abc123",
    });
  });

  test("saveDoc forwards a null baseContentHash for docs absent on load", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "save-doc-new");
    assert.deepStrictEqual(lastPostedMessage(), {
      command: "saveSquadDoc",
      kind: "routing",
      content: "# Routing",
      baseContentHash: null,
    });
  });

  test("runDoctor posts runSquadDoctor", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "run-doctor");
    assert.deepStrictEqual(lastPostedMessage(), { command: "runSquadDoctor" });
  });

  test("checkUpdates posts checkSquadUpdates", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "check-updates");
    assert.deepStrictEqual(lastPostedMessage(), { command: "checkSquadUpdates" });
  });

  test("refreshPlugins posts refreshSquadPlugins", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "refresh-plugins");
    assert.deepStrictEqual(lastPostedMessage(), { command: "refreshSquadPlugins" });
  });

  test("runPluginAction posts runSquadPluginAction with action and target", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "plugin-enable");
    assert.deepStrictEqual(lastPostedMessage(), {
      command: "runSquadPluginAction",
      action: SquadPluginAction.Enable,
      target: "team",
    });
  });

  test("runPluginAction without a target lets the host resolve it", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "plugin-add-nexus");
    assert.deepStrictEqual(lastPostedMessage(), {
      command: "runSquadPluginAction",
      action: SquadPluginAction.AddNexusMarketplace,
      target: undefined,
    });
  });

  test("installCli posts installSquadCli", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "install-cli");
    assert.deepStrictEqual(lastPostedMessage(), { command: "installSquadCli" });
  });

  test("upgradeProject posts upgradeSquadProject (SQD-032)", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "upgrade-project");
    assert.deepStrictEqual(lastPostedMessage(), { command: "upgradeSquadProject" });
  });

  test("setCliInvocation(npx) posts setSquadCliInvocation without a path", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "use-npx");
    assert.deepStrictEqual(lastPostedMessage(), {
      command: "setSquadCliInvocation",
      source: SquadCliSource.Npx,
      cliPath: undefined,
    });
  });

  test("setCliInvocation(custom) posts setSquadCliInvocation with the path", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "use-custom");
    assert.deepStrictEqual(lastPostedMessage(), {
      command: "setSquadCliInvocation",
      source: SquadCliSource.Custom,
      cliPath: "/opt/squad",
    });
  });

  test("upstream actions post the SQD-036 messages", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "list-upstreams");
    assert.deepStrictEqual(lastPostedMessage(), { command: "listSquadUpstreams" });
    click(view, "add-upstream");
    assert.deepStrictEqual(lastPostedMessage(), { command: "addSquadUpstream", source: "org/repo", name: "org", ref: "main" });
    click(view, "sync-upstream");
    assert.deepStrictEqual(lastPostedMessage(), { command: "syncSquadUpstream", name: "org" });
    click(view, "remove-upstream");
    assert.deepStrictEqual(lastPostedMessage(), { command: "removeSquadUpstream", name: "org" });
  });

  test("each action posts exactly one message", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "refresh");
    assert.strictEqual(postedMessagesOfCommand("getSquadState").length, 1);
  });
});
