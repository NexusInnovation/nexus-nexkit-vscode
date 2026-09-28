/**
 * SquadSection (SQD-009) — top-level Squad tab container.
 *
 * Covers the four gate states: still detecting, detection error with retry,
 * detected (status + read-only sections, no preset picker), and not detected
 * (preset picker instead of the read-only sections).
 */

import * as assert from "assert";
import { SquadSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadSection";
import { SquadInstallState } from "../../../src/features/squad/models";
import { renderWithAppState, fireEvent, cleanup, makeDetection, makeProjectInfo, makeError } from "./harness/renderSquad";
import { postedMessagesOfCommand, resetVsCodeApiMock } from "./harness/vscodeApiMock";

suite("SquadSection", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("requests a snapshot and shows the detecting state before the first snapshot", () => {
    const view = renderWithAppState(<SquadSection />, { isReady: false });
    assert.ok(view.getByText(/Detecting Squad/), "shows the detecting placeholder");
    assert.strictEqual(postedMessagesOfCommand("getSquadState").length, 1, "requests the initial snapshot on mount");
    assert.strictEqual(view.container.querySelector(".squad-status"), null, "no status header before readiness");
  });

  test("shows an actionable error with a retry button when detection failed before readiness", () => {
    const view = renderWithAppState(<SquadSection />, {
      isReady: false,
      error: makeError({ message: "Squad detection failed." }),
    });
    assert.ok(view.getByText("Squad detection failed."));
    const retry = view.getByText(/Retry detection/);
    fireEvent.click(retry.closest("button")!);
    assert.ok(postedMessagesOfCommand("getSquadState").length >= 1, "retry re-requests the snapshot");
  });

  test("when detected: renders the status section and read-only sections, not the preset picker", () => {
    const view = renderWithAppState(<SquadSection />, {
      isReady: true,
      detection: makeDetection(),
    });
    assert.ok(view.container.querySelector(".squad-status"), "status header is present");
    assert.ok(view.getByText("Installed"), "shows the installed badge");
    assert.ok(view.getByText("Roster"), "roster section present");
    assert.ok(view.getByText("Governance"), "governance section present");
    assert.strictEqual(
      view.queryByText(/Initialise Squad from a preset/),
      null,
      "preset picker must not appear when Squad is detected"
    );
  });

  test("treats a partial install as detected", () => {
    const view = renderWithAppState(<SquadSection />, {
      isReady: true,
      detection: makeDetection({ project: makeProjectInfo({ installState: SquadInstallState.Partial }) }),
    });
    assert.ok(view.getByText("Roster"), "partial installs still render the read-only sections");
    assert.strictEqual(view.queryByText(/Initialise Squad from a preset/), null);
  });

  test("when not detected: renders the preset picker instead of the read-only sections", () => {
    const view = renderWithAppState(<SquadSection />, {
      isReady: true,
      detection: makeDetection({ project: makeProjectInfo({ installState: SquadInstallState.NotInstalled }) }),
    });
    assert.ok(view.getByText(/Initialise Squad from a preset/), "preset picker shown when not detected");
    assert.strictEqual(view.queryByText("Roster"), null, "read-only roster section hidden when not detected");
    assert.strictEqual(
      postedMessagesOfCommand("listSquadPresets").length,
      1,
      "mounting the picker discovers presets"
    );
  });
});
