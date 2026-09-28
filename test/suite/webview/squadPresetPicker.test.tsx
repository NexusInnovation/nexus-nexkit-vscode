/**
 * SquadPresetPicker (SQD-019) — the "Squad not detected" preset selection
 * screen: discovery on mount, grouping, disabled invalid presets, per-source
 * unreachable errors, loading/empty/hard-error states, and confirm → init.
 */

import * as assert from "assert";
import { SquadPresetPicker } from "../../../src/features/panel-ui/webview/components/organisms/SquadPresetPicker";
import { SquadPresetSourceKind } from "../../../src/features/squad/models";
import {
  renderWithAppState,
  fireEvent,
  cleanup,
  makePreset,
  makeRejectedPreset,
  makeUnreachableSource,
  makeError,
} from "./harness/renderSquad";
import { lastPostedMessage, postedMessagesOfCommand, resetVsCodeApiMock } from "./harness/vscodeApiMock";

suite("SquadPresetPicker", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("discovers presets on first mount", () => {
    renderWithAppState(<SquadPresetPicker />);
    assert.strictEqual(postedMessagesOfCommand("listSquadPresets").length, 1);
  });

  test("shows a loading state while discovery is in flight", () => {
    const view = renderWithAppState(<SquadPresetPicker />, {
      presetPicker: { loading: true, loaded: false },
    });
    assert.ok(view.getByText(/Discovering Squad presets/));
  });

  test("shows a hard error with a retry that re-discovers", () => {
    const view = renderWithAppState(<SquadPresetPicker />, {
      presetPicker: { loaded: true, error: makeError({ message: "Discovery failed hard." }) },
    });
    assert.ok(view.getByText("Discovery failed hard."));
    fireEvent.click(view.getByText(/Retry/).closest("button")!);
    assert.ok(postedMessagesOfCommand("listSquadPresets").length >= 1);
  });

  test("groups valid presets by source with a name/description summary", () => {
    const view = renderWithAppState(<SquadPresetPicker />, {
      presetPicker: {
        loaded: true,
        presets: [
          makePreset("alpha", {
            name: "Alpha team",
            description: "Full squad",
            source: { kind: SquadPresetSourceKind.Marketplace, pluginId: "alpha", squadFolderPath: "p/a" },
          }),
          makePreset("beta", {
            name: "Beta team",
            source: { kind: SquadPresetSourceKind.ExternalRepo, pluginId: "beta", squadFolderPath: "p/b" },
          }),
        ],
      },
    });

    assert.ok(view.getByText("Nexus plugin marketplace"), "marketplace group heading");
    assert.ok(view.getByText("External plugin repositories"), "external group heading");
    assert.ok(view.getByText("Alpha team"));
    assert.ok(view.getByText("Full squad"));
    assert.ok(view.getByText("Beta team"));
  });

  test("renders invalid presets disabled with their blocking diagnostics", () => {
    const view = renderWithAppState(<SquadPresetPicker />, {
      presetPicker: {
        loaded: true,
        presets: [],
        rejected: [makeRejectedPreset("broken", SquadPresetSourceKind.ExternalRepo)],
      },
    });

    const rejected = view.container.querySelector(".squad-preset-card.rejected");
    assert.ok(rejected, "rejected preset is rendered (not hidden)");
    assert.strictEqual(rejected!.getAttribute("aria-disabled"), "true", "rejected preset is disabled");
    assert.strictEqual(rejected!.tagName.toLowerCase(), "div", "rejected preset is not a selectable button");
    assert.ok(view.getByText("Invalid"), "invalid badge shown");
    assert.ok(view.getByText("manifest.json is missing."), "blocking diagnostic message shown");
  });

  test("surfaces unreachable sources with their per-source error, without hiding healthy presets", () => {
    const view = renderWithAppState(<SquadPresetPicker />, {
      presetPicker: {
        loaded: true,
        presets: [makePreset("alpha", { name: "Alpha team" })],
        unreachable: [
          makeUnreachableSource("private-repo", {
            label: "Private external repo",
            error: makeError({ code: "preset-fetch-failed", message: "Repository is private." }),
          }),
        ],
      },
    });

    assert.ok(view.getByText(/Some preset sources could not be reached/));
    assert.ok(view.getByText("Private external repo"));
    assert.ok(view.getByText("Repository is private."));
    assert.ok(view.getByText("Alpha team"), "healthy presets still shown alongside unreachable sources");
  });

  test("shows the empty state when discovery succeeds with no selectable presets", () => {
    const view = renderWithAppState(<SquadPresetPicker />, {
      presetPicker: { loaded: true, presets: [] },
    });
    assert.ok(view.getByText(/No Squad presets are available/));
  });

  test("selecting a preset opens a confirmation panel whose Initialize posts initSquadFromPreset", () => {
    const view = renderWithAppState(<SquadPresetPicker />, {
      presetPicker: { loaded: true, presets: [makePreset("alpha", { name: "Alpha team" })] },
    });

    // No confirmation panel until a preset is chosen.
    assert.strictEqual(view.container.querySelector(".squad-preset-confirm"), null);

    fireEvent.click(view.getByText("Alpha team").closest("button")!);
    assert.ok(view.container.querySelector(".squad-preset-confirm"), "confirmation panel opens on select");

    fireEvent.click(view.getByText(/^Initialize$/).closest("button")!);
    assert.deepStrictEqual(lastPostedMessage(), { command: "initSquadFromPreset", presetId: "alpha" });
  });

  test("an init error is shown inside the confirmation panel (never as success)", () => {
    const view = renderWithAppState(<SquadPresetPicker />, {
      presetPicker: {
        loaded: true,
        presets: [makePreset("alpha", { name: "Alpha team" })],
        initResultPresetId: "alpha",
        initError: makeError({ message: "Initialisation is not available yet." }),
      },
    });

    fireEvent.click(view.getByText("Alpha team").closest("button")!);
    assert.ok(view.getByText("Initialisation is not available yet."), "init error surfaced in the panel");
  });
});
