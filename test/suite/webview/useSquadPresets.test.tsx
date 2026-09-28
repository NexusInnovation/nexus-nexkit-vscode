/**
 * useSquadPresets (SQD-019) — grouping selectors + action message plumbing.
 *
 * Verifies preset grouping/counting, the empty and init-error derivations, and
 * that discovery/init actions post the right host messages. The transient
 * "selected preset" highlight is webview-local (never posted).
 */

import * as assert from "assert";
import { useSquadPresets } from "../../../src/features/panel-ui/webview/hooks/useSquadPresets";
import { SquadPresetSourceKind } from "../../../src/features/squad/models";
import { renderWithAppState, fireEvent, cleanup, makePreset, makeRejectedPreset, makeError } from "./harness/renderSquad";
import { lastPostedMessage, postedMessagesOfCommand, resetVsCodeApiMock } from "./harness/vscodeApiMock";

function PresetProbe() {
  const presets = useSquadPresets();
  return (
    <div>
      <span data-testid="groups">{presets.groups.length}</span>
      <span data-testid="selectable">{presets.selectableCount}</span>
      <span data-testid="empty">{String(presets.isEmpty)}</span>
      <span data-testid="selected">{presets.selectedPreset?.name ?? "none"}</span>
      <span data-testid="init-error">{presets.initError?.message ?? "none"}</span>
      <button data-testid="refresh" onClick={() => presets.refresh()} />
      <button data-testid="select-alpha" onClick={() => presets.select("alpha")} />
      <button data-testid="clear" onClick={() => presets.select(null)} />
      <button
        data-testid="init"
        onClick={() => presets.selectedPreset && presets.initFromPreset(presets.selectedPreset.id)}
      />
    </div>
  );
}

function click(view: ReturnType<typeof renderWithAppState>, testId: string): void {
  fireEvent.click(view.getByTestId(testId));
}

suite("useSquadPresets — grouping and actions", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("refresh posts listSquadPresets", () => {
    const view = renderWithAppState(<PresetProbe />);
    click(view, "refresh");
    assert.deepStrictEqual(lastPostedMessage(), { command: "listSquadPresets" });
  });

  test("groups presets and rejections by source and counts selectable presets", () => {
    const view = renderWithAppState(<PresetProbe />, {
      presetPicker: {
        loaded: true,
        presets: [
          makePreset("alpha", { source: { kind: SquadPresetSourceKind.Marketplace, pluginId: "alpha", squadFolderPath: "p/a" } }),
          makePreset("beta", { source: { kind: SquadPresetSourceKind.ExternalRepo, pluginId: "beta", squadFolderPath: "p/b" } }),
        ],
        rejected: [makeRejectedPreset("broken", SquadPresetSourceKind.ExternalRepo)],
      },
    });

    assert.strictEqual(view.getByTestId("groups").textContent, "2", "marketplace + external groups");
    assert.strictEqual(view.getByTestId("selectable").textContent, "2");
    assert.strictEqual(view.getByTestId("empty").textContent, "false");
  });

  test("isEmpty is true only after a load with zero selectable presets", () => {
    const view = renderWithAppState(<PresetProbe />, {
      presetPicker: { loaded: true, presets: [], rejected: [makeRejectedPreset("broken")] },
    });
    assert.strictEqual(view.getByTestId("selectable").textContent, "0");
    assert.strictEqual(view.getByTestId("empty").textContent, "true");
  });

  test("isEmpty is false while still loading", () => {
    const view = renderWithAppState(<PresetProbe />, {
      presetPicker: { loading: true, loaded: false, presets: [] },
    });
    assert.strictEqual(view.getByTestId("empty").textContent, "false");
  });

  test("select highlights a preset locally without posting a message", () => {
    const view = renderWithAppState(<PresetProbe />, {
      presetPicker: { loaded: true, presets: [makePreset("alpha", { name: "Alpha" })] },
    });
    click(view, "select-alpha");
    assert.strictEqual(view.getByTestId("selected").textContent, "Alpha");
    assert.strictEqual(postedMessagesOfCommand("listSquadPresets").length, 0);
  });

  test("initFromPreset posts initSquadFromPreset for the selected preset", () => {
    const view = renderWithAppState(<PresetProbe />, {
      presetPicker: { loaded: true, presets: [makePreset("alpha")] },
    });
    click(view, "select-alpha");
    click(view, "init");
    assert.deepStrictEqual(lastPostedMessage(), { command: "initSquadFromPreset", presetId: "alpha" });
  });

  test("initError surfaces only for the currently selected preset", () => {
    const view = renderWithAppState(<PresetProbe />, {
      presetPicker: {
        loaded: true,
        presets: [makePreset("alpha")],
        initResultPresetId: "alpha",
        initError: makeError({ message: "Init is not available yet." }),
      },
    });

    // Before selecting, the init error must not leak into the panel.
    assert.strictEqual(view.getByTestId("init-error").textContent, "none");

    click(view, "select-alpha");
    assert.strictEqual(view.getByTestId("init-error").textContent, "Init is not available yet.");

    click(view, "clear");
    assert.strictEqual(view.getByTestId("init-error").textContent, "none");
  });
});
