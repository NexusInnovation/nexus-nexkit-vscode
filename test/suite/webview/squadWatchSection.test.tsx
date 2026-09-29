/**
 * SquadWatchSection (SQD-046) — managed `squad watch` health, logs and actions.
 */

import * as assert from "assert";
import { SquadWatchSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadWatchSection";
import { initialSquadWatchStatus, SquadWatchState } from "../../../src/features/squad/models";
import type { SquadWatchSnapshot } from "../../../src/features/squad/models";
import { renderWithAppState, fireEvent, cleanup, makeError } from "./harness/renderSquad";
import { lastPostedMessage, postedMessagesOfCommand, resetVsCodeApiMock } from "./harness/vscodeApiMock";

function makeWatchSnapshot(overrides: Partial<SquadWatchSnapshot> = {}): SquadWatchSnapshot {
  return {
    status: {
      ...initialSquadWatchStatus,
      ...overrides.status,
    },
    logs: overrides.logs ?? [],
  };
}

suite("SquadWatchSection", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("requests the current watch snapshot when mounted", () => {
    renderWithAppState(<SquadWatchSection />, { watch: makeWatchSnapshot() });
    assert.strictEqual(postedMessagesOfCommand("getSquadWatchStatus").length, 1);
  });

  test("renders running health, process details and the retained log stream", () => {
    const view = renderWithAppState(<SquadWatchSection />, {
      watch: makeWatchSnapshot({
        status: {
          ...initialSquadWatchStatus,
          state: SquadWatchState.Running,
          intervalMinutes: 12,
          startedAt: 1_700_000_000_000,
          logLineCount: 2,
          droppedLogLines: 3,
        },
        logs: [
          { seq: 1, timestamp: 1_700_000_000_001, stream: "system", text: "Started squad watch." },
          { seq: 2, timestamp: 1_700_000_000_002, stream: "stderr", text: "One agent needs attention." },
        ],
      }),
    });

    assert.ok(view.getByText("Running"));
    assert.ok(view.getByText("Squad watch is running and streaming health logs."));
    assert.ok(view.getByText("12 min"));
    assert.ok(view.getByText("Started squad watch."));
    assert.ok(view.getByText("One agent needs attention."));
    assert.ok(view.getByText(/3 older lines dropped/));
  });

  test("starts watch with the requested interval and blocks invalid values", () => {
    const view = renderWithAppState(<SquadWatchSection />, { watch: makeWatchSnapshot() });
    const input = view.container.querySelector(".squad-watch-interval input") as HTMLInputElement;
    const startButton = view.getByText(/Start watch/).closest("button") as HTMLButtonElement;

    fireEvent.input(input, { target: { value: "15" } });
    fireEvent.click(startButton);
    assert.deepStrictEqual(lastPostedMessage(), { command: "startSquadWatch", intervalMinutes: 15 });

    fireEvent.input(input, { target: { value: "0" } });
    assert.ok(view.getByText(/Enter a whole number/));
    assert.strictEqual(startButton.disabled, true);
  });

  test("stops watch normally or forcefully when a process is active", () => {
    const view = renderWithAppState(<SquadWatchSection />, {
      watch: makeWatchSnapshot({
        status: {
          ...initialSquadWatchStatus,
          state: SquadWatchState.Running,
          intervalMinutes: 10,
          startedAt: 1_700_000_000_000,
        },
      }),
    });

    fireEvent.click(view.getByText("Stop").closest("button")!);
    assert.deepStrictEqual(lastPostedMessage(), { command: "stopSquadWatch", force: undefined });

    fireEvent.click(view.getByText("Force stop").closest("button")!);
    assert.deepStrictEqual(lastPostedMessage(), { command: "stopSquadWatch", force: true });
  });

  test("surfaces a failed watch error and empty log state", () => {
    const error = makeError({
      code: "watch-failed",
      message: "Squad watch exited unexpectedly.",
      remediation: "Review the logs and restart watch.",
    });
    const view = renderWithAppState(<SquadWatchSection />, {
      watch: makeWatchSnapshot({
        status: {
          ...initialSquadWatchStatus,
          state: SquadWatchState.Failed,
          error,
        },
      }),
    });

    assert.ok(view.getByText("Failed"));
    assert.ok(view.getByText("Squad watch exited unexpectedly."));
    assert.ok(view.getByText("Review the logs and restart watch."));
    assert.ok(view.getByText("No squad watch log lines captured yet."));
  });
});
