/**
 * useSquadState (SQD-007) — selectors + action message plumbing.
 *
 * Verifies each action posts exactly the message the host expects (with its
 * payload). The VS Code bridge is mocked; only the posted messages are asserted
 * (components stay purely presentational).
 */

import * as assert from "assert";
import { useSquadState } from "../../../src/features/panel-ui/webview/hooks/useSquadState";
import { SquadCliSource } from "../../../src/features/squad/models";
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
      <button data-testid="run-doctor" onClick={() => squad.runDoctor()} />
      <button data-testid="refresh-plugins" onClick={() => squad.refreshPlugins()} />
      <button data-testid="install-cli" onClick={() => squad.installCli()} />
      <button data-testid="use-npx" onClick={() => squad.setCliInvocation(SquadCliSource.Npx)} />
      <button data-testid="use-custom" onClick={() => squad.setCliInvocation(SquadCliSource.Custom, "/opt/squad")} />
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

  test("runDoctor posts runSquadDoctor", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "run-doctor");
    assert.deepStrictEqual(lastPostedMessage(), { command: "runSquadDoctor" });
  });

  test("refreshPlugins posts refreshSquadPlugins", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "refresh-plugins");
    assert.deepStrictEqual(lastPostedMessage(), { command: "refreshSquadPlugins" });
  });

  test("installCli posts installSquadCli", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "install-cli");
    assert.deepStrictEqual(lastPostedMessage(), { command: "installSquadCli" });
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

  test("each action posts exactly one message", () => {
    const view = renderWithAppState(<ActionProbe />);
    click(view, "refresh");
    assert.strictEqual(postedMessagesOfCommand("getSquadState").length, 1);
  });
});
