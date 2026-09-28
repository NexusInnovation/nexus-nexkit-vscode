/**
 * Read-only Squad views (SQD-012/013/014) + SquadMarkdownView.
 *
 * Covers loading / empty / error / data states for the roster, governance and
 * log sections, the log truncation affordances (FR-025), and — critically — the
 * charter of SquadMarkdownView: workspace content is rendered as escaped text,
 * never as live HTML, so a `<script>` payload is inert text, not an element.
 */

import * as assert from "assert";
import { SquadRosterSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadRosterSection";
import { SquadGovernanceSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadGovernanceSection";
import { SquadLogSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadLogSection";
import { SquadMarkdownView } from "../../../src/features/panel-ui/webview/components/molecules/SquadMarkdownView";
import { SquadLogKind } from "../../../src/features/panel-ui/webview/types/squadState";
import { render, cleanup, renderWithAppState, fireEvent, makeError } from "./harness/renderSquad";
import { resetVsCodeApiMock } from "./harness/vscodeApiMock";

const SCRIPT_PAYLOAD = "<script>alert('xss')</script>";

suite("Read-only Squad views", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  suite("SquadMarkdownView (safe rendering)", () => {
    test("renders content inside a <pre> as escaped text — never as an element", () => {
      const view = render(<SquadMarkdownView content={`# Title\n${SCRIPT_PAYLOAD}`} />);
      assert.strictEqual(view.container.querySelector("script"), null, "the payload must not become a live element");
      const pre = view.container.querySelector("pre.squad-markdown") as HTMLElement;
      assert.ok(pre, "content is rendered in a <pre>");
      assert.ok(pre.textContent?.includes(SCRIPT_PAYLOAD), "the raw markup is preserved as text");
    });

    test("shows the empty message for whitespace-only content", () => {
      const view = render(<SquadMarkdownView content={"   \n  "} emptyMessage="Nothing here." />);
      assert.ok(view.getByText("Nothing here."));
      assert.strictEqual(view.container.querySelector("pre.squad-markdown"), null);
    });
  });

  suite("SquadRosterSection", () => {
    test("shows a loading state before the first snapshot", () => {
      const view = renderWithAppState(<SquadRosterSection />, { isReady: false });
      assert.ok(view.getByText(/Loading roster/));
    });

    test("shows an empty state when the roster is empty", () => {
      const view = renderWithAppState(<SquadRosterSection />, { isReady: true, roster: [] });
      assert.ok(view.getByText(/No Squad members found/));
    });

    test("shows an actionable error", () => {
      const view = renderWithAppState(<SquadRosterSection />, {
        isReady: true,
        error: makeError({ message: "Failed to read the roster." }),
      });
      assert.ok(view.getByText("Failed to read the roster."));
    });

    test("renders roster rows and reveals an escaped charter on click", () => {
      const view = renderWithAppState(<SquadRosterSection />, {
        isReady: true,
        roster: [{ id: "trinity", name: "Trinity", role: "QA", summary: "Owns tests", hasCharter: true }],
        charters: [
          {
            agentId: "trinity",
            relativePath: ".squad/agents/trinity/charter.md",
            content: `# Trinity\n${SCRIPT_PAYLOAD}`,
          },
        ],
      });

      assert.ok(view.getByText("Trinity"));
      assert.ok(view.getByText("QA"));
      assert.strictEqual(view.container.querySelector(".squad-charter-detail"), null, "charter hidden until selected");

      fireEvent.click(view.getByText("Trinity").closest("tr")!);

      const detail = view.container.querySelector(".squad-charter-detail");
      assert.ok(detail, "charter revealed after clicking the row");
      assert.strictEqual(detail!.querySelector("script"), null, "charter markup is escaped, not executed");
      assert.ok(detail!.querySelector("pre.squad-markdown")?.textContent?.includes(SCRIPT_PAYLOAD));
    });

    test("does not reveal a charter for a member without one", () => {
      const view = renderWithAppState(<SquadRosterSection />, {
        isReady: true,
        roster: [{ id: "ghost", name: "Ghost", hasCharter: false }],
      });
      fireEvent.click(view.getByText("Ghost").closest("tr")!);
      assert.strictEqual(view.container.querySelector(".squad-charter-detail"), null);
    });
  });

  suite("SquadGovernanceSection", () => {
    test("shows a loading state before the first snapshot", () => {
      const view = renderWithAppState(<SquadGovernanceSection />, { isReady: false });
      assert.ok(view.getByText(/Loading governance documents/));
    });

    test("shows an explicit empty state for an absent decisions document", () => {
      const view = renderWithAppState(<SquadGovernanceSection />, { isReady: true, decisions: null });
      assert.ok(view.container.textContent?.includes("decisions.md"), "names the missing file");
    });

    test("renders an escaped decisions document when present", () => {
      const view = renderWithAppState(<SquadGovernanceSection />, {
        isReady: true,
        decisions: {
          kind: "decisions",
          relativePath: ".squad/decisions.md",
          exists: true,
          content: `# Decisions\n${SCRIPT_PAYLOAD}`,
        },
      });
      assert.strictEqual(view.container.querySelector("script"), null, "decisions markup is escaped");
      assert.ok(view.container.querySelector("pre.squad-markdown")?.textContent?.includes(SCRIPT_PAYLOAD));
    });
  });

  suite("SquadLogSection", () => {
    test("shows a loading state before the first snapshot", () => {
      const view = renderWithAppState(<SquadLogSection />, { isReady: false });
      assert.ok(view.getByText(/Loading logs/));
    });

    test("shows an empty state when there are no logs", () => {
      const view = renderWithAppState(<SquadLogSection />, { isReady: true, logs: [] });
      assert.ok(view.getByText(/No agent histories or logs found/));
    });

    test("groups logs by kind and renders a truncation badge + notice for truncated files", () => {
      const view = renderWithAppState(<SquadLogSection />, {
        isReady: true,
        logs: [
          {
            kind: SquadLogKind.Log,
            relativePath: ".squad/logs/session.md",
            content: `partial log\n${SCRIPT_PAYLOAD}`,
            truncated: true,
            sizeBytes: 262144,
          },
        ],
      });

      assert.ok(view.getByText(/Session logs/), "logs grouped by kind");
      assert.ok(view.getByText("truncated"), "a truncated log shows its badge");

      // Expand the entry to reveal the truncation notice and the escaped body.
      fireEvent.click(view.getByText("session.md").closest("button")!);
      assert.ok(view.getByText(/has been truncated for display/), "truncation notice shown when opened");
      assert.strictEqual(view.container.querySelector("script"), null, "log body is escaped");
      assert.ok(view.container.querySelector("pre.squad-markdown")?.textContent?.includes(SCRIPT_PAYLOAD));
    });
  });
});
