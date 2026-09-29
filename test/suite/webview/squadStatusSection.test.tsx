/**
 * SquadStatusSection (SQD-010 / SQD-025) — status header, CLI-missing chooser
 * and Squad Doctor diagnostics.
 */

import * as assert from "assert";
import { SquadStatusSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadStatusSection";
import { SquadCliSource, SquadDoctorSeverity } from "../../../src/features/squad/models";
import {
  renderWithAppState,
  fireEvent,
  cleanup,
  makeDetection,
  makeCliInfo,
  makeDoctorReport,
  makeError,
} from "./harness/renderSquad";
import { lastPostedMessage, postedMessagesOfCommand, resetVsCodeApiMock } from "./harness/vscodeApiMock";

suite("SquadStatusSection", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("renders nothing until a detection snapshot exists", () => {
    const view = renderWithAppState(<SquadStatusSection />, { detection: null });
    assert.strictEqual(view.container.querySelector(".squad-status"), null);
  });

  test("shows version details and hides the CLI chooser when the CLI is installed", () => {
    const view = renderWithAppState(<SquadStatusSection />, { detection: makeDetection() });
    assert.ok(view.getByText("Installed"));
    assert.ok(view.getByText("1.2.3"), "project version is shown");
    assert.strictEqual(view.container.querySelector(".squad-cli-missing"), null, "no CLI chooser when installed");
  });

  suite("CLI-missing chooser", () => {
    function renderMissing() {
      return renderWithAppState(<SquadStatusSection />, {
        detection: makeDetection({ cli: makeCliInfo({ installed: false, source: undefined, cliVersion: null }) }),
      });
    }

    test("is shown with 'not detected' when the CLI is missing", () => {
      const view = renderMissing();
      assert.ok(view.container.querySelector(".squad-cli-missing"), "CLI chooser appears");
      assert.ok(view.getByText("not detected"));
    });

    test("'Install with npm' posts installSquadCli (never installs silently)", () => {
      const view = renderMissing();
      fireEvent.click(view.getByText(/Install with npm/).closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), { command: "installSquadCli" });
    });

    test("'Use npx' persists the npx invocation", () => {
      const view = renderMissing();
      fireEvent.click(view.getByText("Use npx").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "setSquadCliInvocation",
        source: SquadCliSource.Npx,
        cliPath: undefined,
      });
    });

    test("custom path is disabled until a path is entered, then persists the custom invocation", () => {
      const view = renderMissing();
      const button = view.getByText(/Use this path/).closest("button") as HTMLButtonElement;
      assert.strictEqual(button.disabled, true, "custom path button starts disabled");

      const input = view.container.querySelector(".squad-cli-path-input") as HTMLInputElement;
      fireEvent.input(input, { target: { value: "  /opt/squad  " } });
      assert.strictEqual(button.disabled, false, "entering a path enables the button");

      fireEvent.click(button);
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "setSquadCliInvocation",
        source: SquadCliSource.Custom,
        cliPath: "/opt/squad",
      });
    });
  });

  suite("Diagnostics", () => {
    test("Run Doctor posts runSquadDoctor", () => {
      const view = renderWithAppState(<SquadStatusSection />, { detection: makeDetection() });
      fireEvent.click(view.getByText(/Run Doctor/).closest("button")!);
      assert.strictEqual(postedMessagesOfCommand("runSquadDoctor").length, 1);
    });

    test("shows the empty prompt when no doctor report has run", () => {
      const view = renderWithAppState(<SquadStatusSection />, { detection: makeDetection(), doctor: null });
      assert.ok(view.getByText(/Run Squad Doctor to check your workspace/));
    });

    test("renders a doctor report summary, each check, and the text-fallback note", () => {
      const view = renderWithAppState(<SquadStatusSection />, {
        detection: makeDetection(),
        doctor: makeDoctorReport({
          overall: SquadDoctorSeverity.Error,
          structured: false,
          checks: [
            {
              label: "CLI reachable",
              severity: SquadDoctorSeverity.Error,
              message: "Squad CLI did not respond.",
              remediation: "Install the Squad CLI.",
            },
          ],
        }),
      });
      assert.ok(view.getByText(/1 error/), "summary reflects the error count");
      assert.ok(view.getByText("CLI reachable"), "check label rendered");
      assert.ok(view.getByText("Squad CLI did not respond."), "check message rendered");
      assert.ok(view.getByText("Install the Squad CLI."), "remediation rendered");
      assert.ok(view.getByText(/parsed from text output/), "text-fallback note shown when not structured");
    });

    test("surfaces a doctor-failed error as an actionable notice instead of a report", () => {
      const view = renderWithAppState(<SquadStatusSection />, {
        detection: makeDetection(),
        error: makeError({ code: "doctor-failed", message: "Squad Doctor crashed." }),
      });
      assert.ok(view.getByText("Squad Doctor crashed."));
      assert.strictEqual(view.container.querySelector(".squad-doctor-report"), null, "no report when doctor failed");
    });
  });
});
