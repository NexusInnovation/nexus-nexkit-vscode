/**
 * Squad charter / governance editors (SQD-029, FR-023/FR-024).
 *
 * Exercises the edit → dirty → save/cancel lifecycle end-to-end through the
 * real {@link AppStateProvider}: the posted host messages (with the SQD-027
 * `baseContentHash`), success feedback with the backup notice, inline and
 * actionable save errors that never look like success (backup failure, write
 * conflict), the discard confirmation, truncated/absent documents, and draft
 * persistence across unmounts.
 */

import * as assert from "assert";
import { SquadGovernanceSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadGovernanceSection";
import { SquadRosterSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadRosterSection";
import { useAppState } from "../../../src/features/panel-ui/webview/hooks/useAppState";
import type { SquadState } from "../../../src/features/panel-ui/webview/types/squadState";
import type { SquadMarkdownDoc } from "../../../src/features/squad/models";
import { renderWithProvider, act, cleanup, fireEvent, makeDetection, makeError } from "./harness/renderSquad";
import { dispatchExtensionMessage, postedMessagesOfCommand, resetVsCodeApiMock } from "./harness/vscodeApiMock";

type View = ReturnType<typeof renderWithProvider>;

function send(message: Record<string, unknown>): void {
  act(() => {
    dispatchExtensionMessage(message);
  });
}

function makeDoc(overrides: Partial<SquadMarkdownDoc> = {}): SquadMarkdownDoc {
  return {
    kind: "decisions",
    relativePath: ".squad/decisions.md",
    exists: true,
    content: "# Decisions\n- keep it simple",
    contentHash: "hash-1",
    truncated: false,
    ...overrides,
  };
}

function writeSummary(relativePath: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { relativePath, created: false, backupCreated: true, bytesWritten: 42, ...overrides };
}

function makeReady(): void {
  send({ command: "squadStatusUpdate", detection: makeDetection(), upstreams: [], marketplaces: [], plugins: [] });
}

function renderGovernance(decisions: SquadMarkdownDoc | null = makeDoc(), routing: SquadMarkdownDoc | null = null): View {
  const view = renderWithProvider(<SquadGovernanceSection />);
  makeReady();
  send({ command: "squadDocsUpdate", decisions, routing });
  return view;
}

function textarea(view: View, label = "Edit decisions.md"): HTMLTextAreaElement {
  return view.getByLabelText(label) as HTMLTextAreaElement;
}

function button(view: View, name: string | RegExp): HTMLButtonElement {
  return view.getByRole("button", { name }) as HTMLButtonElement;
}

function type(view: View, value: string, label?: string): void {
  fireEvent.input(textarea(view, label), { target: { value } });
}

function startEditingDecisions(view: View): void {
  fireEvent.click(button(view, "Edit decisions.md"));
}

suite("Squad editors — governance documents (FR-024)", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("opens an editor seeded with the document, backup notice and a clean state", () => {
    const view = renderGovernance();
    startEditingDecisions(view);

    assert.strictEqual(textarea(view).value, "# Decisions\n- keep it simple");
    assert.ok(view.getByText(/backs up your Squad files first/));
    assert.ok(view.getByText("No changes"));
    assert.strictEqual(button(view, /Save/).disabled, true);
  });

  test("tracks the dirty state and saves with the base content hash", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "# Decisions\n- updated");

    assert.ok(view.getByText("Unsaved changes"));
    assert.strictEqual(button(view, /Save/).disabled, false);

    fireEvent.click(button(view, /Save/));

    assert.deepStrictEqual(postedMessagesOfCommand("saveSquadDoc"), [
      { command: "saveSquadDoc", kind: "decisions", content: "# Decisions\n- updated", baseContentHash: "hash-1" },
    ]);
    assert.ok(view.getAllByText("Saving…").length >= 1);
    assert.strictEqual(textarea(view).readOnly, true);
    assert.strictEqual(button(view, "Cancel").disabled, true);
  });

  test("shows success with the backup notice and leaves edit mode once the host confirms", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "# Decisions\n- updated");
    fireEvent.click(button(view, /Save/));

    send({
      command: "squadDocSaved",
      doc: makeDoc({ content: "# Decisions\n- updated", contentHash: "hash-2" }),
      result: writeSummary(".squad/decisions.md"),
    });

    assert.strictEqual(view.queryByLabelText("Edit decisions.md"), null);
    const notice = view.getByRole("status");
    assert.match(notice.textContent ?? "", /Saved \.squad\/decisions\.md/);
    assert.match(notice.textContent ?? "", /backed up first/);
    assert.match(view.getByLabelText("Squad decisions").textContent ?? "", /- updated/);

    fireEvent.click(button(view, "Dismiss save notice"));
    assert.strictEqual(view.queryByRole("status"), null);
  });

  test("reports when no backup was needed", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "changed");
    fireEvent.click(button(view, /Save/));
    send({ command: "squadDocSaved", doc: makeDoc({ content: "changed" }), result: writeSummary(".squad/decisions.md", { backupCreated: false }) });

    assert.match(view.getByRole("status").textContent ?? "", /No existing Squad files needed a backup/);
  });

  test("a backup failure is shown inline, keeps the draft and never shows success", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "my draft");
    fireEvent.click(button(view, /Save/));

    send({
      command: "squadError",
      error: makeError({ code: "backup-failed", message: "Backup failed.", remediation: "Free disk space and retry." }),
    });

    const editorError = view.container.querySelector(".squad-editor-error");
    assert.ok(editorError, "expected an inline editor error");
    assert.match(editorError.textContent ?? "", /Backup failed\./);
    assert.match(editorError.textContent ?? "", /Free disk space and retry\./);
    assert.strictEqual(textarea(view).value, "my draft");
    assert.strictEqual(view.queryByRole("status"), null);
    assert.strictEqual(button(view, /Save/).disabled, false, "the user can retry");
  });

  test("a write conflict keeps the draft and offers to reload the latest content", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "stale draft");
    fireEvent.click(button(view, /Save/));

    send({
      command: "squadError",
      error: makeError({ code: "write-conflict", message: "decisions.md changed on disk.", remediation: "Reload and reapply." }),
    });

    assert.strictEqual(textarea(view).value, "stale draft");
    fireEvent.click(button(view, /Discard draft & reload latest/));

    assert.strictEqual(postedMessagesOfCommand("getSquadState").length, 1);
    assert.strictEqual(view.queryByLabelText("Edit decisions.md"), null);
  });

  test("non-write errors do not resolve a pending save", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "draft");
    fireEvent.click(button(view, /Save/));

    send({ command: "squadError", error: makeError({ code: "detection-failed" }) });

    assert.strictEqual(view.container.querySelector(".squad-editor-error"), null);
    assert.ok(view.getAllByText("Saving…").length >= 1);
  });

  test("a save confirmation for another document does not resolve this editor", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "draft");
    fireEvent.click(button(view, /Save/));

    send({ command: "squadDocSaved", doc: makeDoc({ kind: "routing", relativePath: ".squad/routing.md" }), result: writeSummary(".squad/routing.md") });

    assert.strictEqual(textarea(view).value, "draft");
    assert.ok(view.getAllByText("Saving…").length >= 1);
  });

  test("cancel leaves a clean editor immediately", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    fireEvent.click(button(view, "Cancel"));

    assert.strictEqual(view.queryByLabelText("Edit decisions.md"), null);
  });

  test("cancel on a dirty editor asks before discarding", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "unsaved");
    fireEvent.click(button(view, "Cancel"));

    assert.ok(view.getByText("Discard unsaved changes?"));
    fireEvent.click(button(view, "Keep editing"));
    assert.strictEqual(textarea(view).value, "unsaved");

    fireEvent.click(button(view, "Cancel"));
    fireEvent.click(button(view, "Discard"));
    assert.strictEqual(view.queryByLabelText("Edit decisions.md"), null);
    assert.strictEqual(postedMessagesOfCommand("saveSquadDoc").length, 0);
  });

  test("truncated documents are not editable from the panel", () => {
    const view = renderGovernance(makeDoc({ truncated: true }));

    assert.strictEqual(button(view, "Edit decisions.md").disabled, true);
    assert.ok(view.getByText(/too large to edit safely in the panel/));
  });

  test("an absent document can be created with a null base hash", () => {
    const view = renderGovernance(makeDoc({ exists: false, content: "", contentHash: null }));

    fireEvent.click(button(view, "Create decisions.md"));
    type(view, "# Decisions");
    fireEvent.click(button(view, /Save/));

    assert.deepStrictEqual(postedMessagesOfCommand("saveSquadDoc"), [
      { command: "saveSquadDoc", kind: "decisions", content: "# Decisions", baseContentHash: null },
    ]);
  });

  test("warns when the file changes on disk while editing", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "draft");

    send({ command: "squadDocsUpdate", decisions: makeDoc({ content: "# Decisions\n- by Scribe", contentHash: "hash-9" }), routing: null });

    assert.ok(view.getByText("This file changed on disk after you started editing."));
    assert.strictEqual(textarea(view).value, "draft");
  });

  test("keeps the unsaved draft when the section is collapsed and re-expanded", () => {
    const view = renderGovernance();
    startEditingDecisions(view);
    type(view, "persisted draft");

    fireEvent.click(view.getByText("Decisions"));
    assert.strictEqual(view.queryByLabelText("Edit decisions.md"), null);
    fireEvent.click(view.getByText("Decisions"));

    assert.strictEqual(textarea(view).value, "persisted draft");
    assert.ok(view.getByText("Unsaved changes"));
  });
});

suite("Squad editors — charters (FR-023)", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  function renderRoster(): View {
    const view = renderWithProvider(<SquadRosterSection />);
    makeReady();
    send({
      command: "squadRosterUpdate",
      roster: [{ id: "trinity", name: "Trinity", role: "Backend", hasCharter: true }],
      charters: [{ agentId: "trinity", relativePath: ".squad/agents/trinity/charter.md", content: "# Trinity" }],
    });
    fireEvent.click(view.getByText("Trinity"));
    return view;
  }

  test("edits and saves a charter through the backup-first write path", () => {
    const view = renderRoster();
    fireEvent.click(button(view, "Edit trinity charter"));
    type(view, "# Trinity\nOwns backend.", "Edit trinity charter");
    fireEvent.click(button(view, /Save/));

    assert.deepStrictEqual(postedMessagesOfCommand("saveSquadCharter"), [
      { command: "saveSquadCharter", agentId: "trinity", content: "# Trinity\nOwns backend." },
    ]);

    send({
      command: "squadCharterSaved",
      charter: { agentId: "trinity", relativePath: ".squad/agents/trinity/charter.md", content: "# Trinity\nOwns backend." },
      result: writeSummary(".squad/agents/trinity/charter.md"),
    });

    assert.strictEqual(view.queryByLabelText("Edit trinity charter"), null);
    assert.match(view.getByRole("status").textContent ?? "", /Saved \.squad\/agents\/trinity\/charter\.md/);
    assert.match(view.getByLabelText("trinity charter").textContent ?? "", /Owns backend\./);
  });

  test("Ctrl+S saves the dirty draft", () => {
    const view = renderRoster();
    fireEvent.click(button(view, "Edit trinity charter"));
    type(view, "# Trinity v2", "Edit trinity charter");
    fireEvent.keyDown(textarea(view, "Edit trinity charter"), { key: "s", ctrlKey: true });

    assert.strictEqual(postedMessagesOfCommand("saveSquadCharter").length, 1);
  });

  test("a failed charter save stays in edit mode with an actionable error", () => {
    const view = renderRoster();
    fireEvent.click(button(view, "Edit trinity charter"));
    type(view, "# Trinity v2", "Edit trinity charter");
    fireEvent.click(button(view, /Save/));

    send({ command: "squadError", error: makeError({ code: "file-write-failed", message: "Could not write charter.", remediation: "Check permissions." }) });

    assert.strictEqual(textarea(view, "Edit trinity charter").value, "# Trinity v2");
    assert.match(view.container.querySelector(".squad-editor-error")?.textContent ?? "", /Check permissions\./);
    assert.strictEqual(view.queryByRole("status"), null);
  });
});

suite("AppStateContext — Squad write outcomes (SQD-029)", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  function SquadProbe() {
    const { squad } = useAppState();
    return <pre data-testid="squad-json">{JSON.stringify(squad)}</pre>;
  }

  test("records sequenced success and write-failure outcomes, ignoring other errors", () => {
    const view = renderWithProvider(<SquadProbe />);
    const squad = () => JSON.parse(view.getByTestId("squad-json").textContent ?? "{}") as SquadState;

    assert.strictEqual(squad().lastWrite, null);

    send({ command: "squadDocSaved", doc: makeDoc(), result: writeSummary(".squad/decisions.md") });
    assert.deepStrictEqual(squad().lastWrite, {
      sequence: 1,
      ok: true,
      target: { type: "doc", kind: "decisions" },
      summary: writeSummary(".squad/decisions.md"),
    });

    send({ command: "squadError", error: makeError({ code: "detection-failed" }) });
    assert.strictEqual(squad().lastWrite?.sequence, 1);

    send({ command: "squadError", error: makeError({ code: "write-conflict", message: "Conflict." }) });
    const failure = squad().lastWrite;
    assert.strictEqual(failure?.sequence, 2);
    assert.strictEqual(failure?.ok, false);

    send({
      command: "squadCharterSaved",
      charter: { agentId: "neo", relativePath: ".squad/agents/neo/charter.md", content: "# Neo" },
      result: writeSummary(".squad/agents/neo/charter.md", { created: true }),
    });
    const charterWrite = squad().lastWrite;
    assert.strictEqual(charterWrite?.sequence, 3);
    assert.ok(charterWrite?.ok && charterWrite.target.type === "charter" && charterWrite.target.agentId === "neo");
  });
});
