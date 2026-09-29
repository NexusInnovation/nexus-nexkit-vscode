/**
 * Squad Worktrees section — preview/create/retry/cleanup UI.
 */

import * as assert from "assert";
import { SquadWorktreeSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadWorktreeSection";
import {
  cleanup,
  fireEvent,
  makeBacklogItem,
  makeCleanupCandidate,
  makeWorktree,
  makeWorktreeOutcome,
  makeWorktreePreview,
  renderWithWorktreeState,
} from "./harness/renderSquad";
import { getPostedMessages, postedMessagesOfCommand, resetVsCodeApiMock } from "./harness/vscodeApiMock";

suite("SquadWorktreeSection", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("requests backlog items and worktrees on mount", () => {
    renderWithWorktreeState(<SquadWorktreeSection />);

    assert.strictEqual(postedMessagesOfCommand("listSquadBacklogItems").length, 1);
    assert.strictEqual(postedMessagesOfCommand("getSquadWorktrees").length, 1);
  });

  test("sends a typed preview request and renders the read-only preview", () => {
    const item = makeBacklogItem();
    const view = renderWithWorktreeState(<SquadWorktreeSection />, {
      squadWorktrees: {
        items: [item],
        preview: makeWorktreePreview({ itemId: item.id, branch: "squad/269-worktree-ui", displayPath: "C:\\wt\\repo-269" }),
      },
    });

    fireEvent.input(view.getByLabelText("Squad backlog item"), { target: { value: item.id } });
    fireEvent.click(view.getByText("Preview"));

    const previewRequest = postedMessagesOfCommand("previewSquadWorktree").at(-1);
    assert.ok(previewRequest);
    assert.deepStrictEqual(previewRequest.request, {
      providerId: item.providerId,
      itemId: item.id,
      baseBranch: undefined,
      dependencies: "auto",
      openInNewWindow: true,
    });
    assert.ok(view.getByLabelText("Worktree preview"));
    assert.ok(view.getByText("squad/269-worktree-ui"));
    assert.ok(view.getByText("C:\\wt\\repo-269"));
  });

  test("shows partial dependency failure and posts retry dependencies", () => {
    const outcome = makeWorktreeOutcome({
      dependencies: {
        mode: "install",
        state: "failed",
        error: { code: "dependency-setup-failed", message: "pnpm install failed.", remediation: "Retry the install." },
      },
      worktree: makeWorktree({ id: "wt-failed", dependencies: "failed" }),
    });
    const view = renderWithWorktreeState(<SquadWorktreeSection />, {
      squadWorktrees: { lastOutcome: outcome },
    });

    assert.ok(view.getByText(/dependencies failed/i));
    fireEvent.click(view.getByText("Retry dependencies"));

    const retry = postedMessagesOfCommand("retrySquadWorktreeDependencies").at(-1);
    assert.deepStrictEqual(retry, {
      command: "retrySquadWorktreeDependencies",
      worktreeId: "wt-failed",
      dependencies: "install",
    });
  });

  test("renders cleanup confirmation and sends id-only cleanup request", () => {
    const worktree = makeWorktree({ id: "cleanup-269", dirty: true });
    const candidate = makeCleanupCandidate({ worktree, reasons: ["pr-merged"], blockers: ["dirty"] });
    const view = renderWithWorktreeState(<SquadWorktreeSection />, {
      squadWorktrees: {
        worktrees: [worktree],
        cleanupCandidates: [candidate],
      },
    });

    fireEvent.click(view.getByText("Clean up"));
    assert.ok(view.getByText("Confirm cleanup"));
    assert.ok(view.getByText(/Blockers: dirty/));
    const confirm = view.getByText("Clean up worktree") as HTMLButtonElement;
    assert.strictEqual(confirm.disabled, true, "dirty worktree requires explicit discard confirmation");

    fireEvent.click(view.getByText("Confirm stash/discard for dirty or unpushed work"));
    assert.strictEqual(confirm.disabled, false);
    fireEvent.click(confirm);

    const cleanupRequest = postedMessagesOfCommand("cleanupSquadWorktree").at(-1);
    assert.deepStrictEqual(cleanupRequest, {
      command: "cleanupSquadWorktree",
      request: {
        worktreeId: "cleanup-269",
        deleteBranch: true,
        discardChanges: true,
      },
    });
    assert.ok(!JSON.stringify(getPostedMessages()).includes("C:\\wt"), "webview cleanup messages must not include paths");
  });
});
