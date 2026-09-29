/**
 * SQD-044 backlog status UI tests.
 *
 * Exercises the presentational Squad status card through the happy-dom/Preact
 * harness with AppState-seeded GitHub, Azure DevOps, not-detected and error
 * states. Host message plumbing for the refresh action is asserted through the
 * mocked VS Code bridge.
 */

import * as assert from "assert";
import { SquadStatusSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadStatusSection";
import type { SquadBacklogState } from "../../../src/features/panel-ui/webview/types/squadState";
import {
  cleanup,
  fireEvent,
  makeAzureDevOpsBacklogDetection,
  makeBacklogNotDetected,
  makeDetection,
  makeError,
  makeGitHubBacklogDetection,
  renderWithAppState,
} from "./harness/renderSquad";
import { lastPostedMessage, resetVsCodeApiMock } from "./harness/vscodeApiMock";

function renderStatus(backlog: Partial<SquadBacklogState>) {
  return renderWithAppState(<SquadStatusSection />, {
    isReady: true,
    detection: makeDetection(),
    backlog,
  });
}

suite("SquadBacklogStatusSection", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("renders detected GitHub Issues backlog with counts and v1 limitations", () => {
    const view = renderStatus({
      isReady: true,
      detection: makeGitHubBacklogDetection(),
      error: null,
    });

    assert.ok(view.getByText("GitHub Issues"));
    assert.ok(view.getByText("NexusInnovation/nexus-nexkit-vscode"));
    assert.ok(view.getByText("github.com/NexusInnovation/nexus-nexkit-vscode"));
    assert.ok(view.getByText("42"));
    assert.ok(view.getByText("12"));
    assert.ok(view.getByText("3"));
    assert.ok(view.getByText(/GitHub Projects is planned but not enabled in v1/));
    assert.ok(view.getByText(/Jira is deferred and not natively supported/));
  });

  test("renders detected Azure DevOps backlog with configured defaults", () => {
    const view = renderStatus({
      isReady: true,
      detection: makeAzureDevOpsBacklogDetection(),
      error: null,
    });

    assert.ok(view.getByText("Azure DevOps"));
    assert.ok(view.getByText("contoso/NexKit"));
    assert.ok(view.getByText(".squad/config.json"));
    assert.ok(view.getByText("User Story"));
    assert.ok(view.getByText("NexKit\\Squad"));
    assert.ok(view.getByText("NexKit\\P3"));
  });

  test("renders not-detected backlog guidance without an error alert", () => {
    const view = renderStatus({
      isReady: true,
      detection: makeBacklogNotDetected(),
      error: null,
    });

    assert.ok(view.getByText("Not detected"));
    assert.ok(view.getByText("No supported Squad backlog was detected from the configured git remotes."));
    assert.strictEqual(view.queryByRole("alert"), null);
  });

  test("renders actionable backlog errors without success-shaped content", () => {
    const view = renderStatus({
      isReady: true,
      detection: null,
      error: makeError({
        code: "backlog-auth-required",
        message: "The GitHub CLI is not authenticated for github.com.",
        remediation: "Run `gh auth login --hostname github.com` in a terminal, then refresh.",
      }),
    });

    assert.ok(view.getByText("Needs attention"));
    assert.ok(view.getByRole("alert"));
    assert.ok(view.getByText("The GitHub CLI is not authenticated for github.com."));
    assert.strictEqual(view.queryByText("Detected"), null);
  });

  test("refresh button posts refreshSquadBacklog", () => {
    const view = renderStatus({
      isReady: true,
      detection: makeGitHubBacklogDetection(),
      error: null,
    });

    fireEvent.click(view.getByLabelText("Refresh Squad backlog status"));
    assert.deepStrictEqual(lastPostedMessage(), { command: "refreshSquadBacklog" });
  });
});
