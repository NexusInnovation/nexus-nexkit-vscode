import * as assert from "assert";
import {
  RejectedSquadPreset,
  SquadPreset,
  SquadPresetSourceKind,
} from "../../src/features/squad/models";
import {
  countSelectablePresets,
  describeSquadPresetSource,
  describeSquadPresetSourceKind,
  groupSquadPresets,
  summarizeSquadPreset,
} from "../../src/features/panel-ui/webview/utils/squadPresetGrouping";

function preset(id: string, kind: SquadPresetSourceKind, extra: Partial<SquadPreset> = {}): SquadPreset {
  return {
    id,
    name: `Preset ${id}`,
    source: {
      kind,
      pluginId: id,
      squadFolderPath: `plugins/${id}/squad`,
    },
    ...extra,
  };
}

function rejected(pluginId: string, kind: SquadPresetSourceKind): RejectedSquadPreset {
  return {
    pluginId,
    source: { kind, pluginId, squadFolderPath: `plugins/${pluginId}/squad` },
    diagnostics: [{ code: "required-file-missing", severity: "error", message: "missing" }],
  };
}

suite("Unit: squadPresetGrouping (SQD-019)", () => {
  test("describeSquadPresetSourceKind maps known kinds and falls back", () => {
    assert.strictEqual(describeSquadPresetSourceKind(SquadPresetSourceKind.Marketplace), "Nexus plugin marketplace");
    assert.strictEqual(describeSquadPresetSourceKind(SquadPresetSourceKind.ExternalRepo), "External plugin repositories");
    assert.strictEqual(describeSquadPresetSourceKind(SquadPresetSourceKind.Local), "Local folders");
    assert.strictEqual(describeSquadPresetSourceKind("mystery"), "Other sources");
  });

  test("describeSquadPresetSource joins plugin id and repository", () => {
    const label = describeSquadPresetSource({
      kind: SquadPresetSourceKind.ExternalRepo,
      pluginId: "greffondors",
      repository: "NexusInnovation/nexus-nexkit-templates-cnq",
      squadFolderPath: "squad",
    });
    assert.strictEqual(label, "greffondors · NexusInnovation/nexus-nexkit-templates-cnq");
  });

  test("describeSquadPresetSource falls back to the kind label when empty", () => {
    const label = describeSquadPresetSource({
      kind: SquadPresetSourceKind.Local,
      pluginId: "",
      squadFolderPath: "squad",
    });
    assert.strictEqual(label, "Local folders");
  });

  test("summarizeSquadPreset includes version and source", () => {
    const summary = summarizeSquadPreset(
      preset("alpha", SquadPresetSourceKind.Marketplace, { version: "1.2.0" })
    );
    assert.ok(summary.startsWith("v1.2.0 · "));
    assert.ok(summary.includes("alpha"));
  });

  test("summarizeSquadPreset omits the version when absent", () => {
    const summary = summarizeSquadPreset(preset("beta", SquadPresetSourceKind.Marketplace));
    assert.ok(!summary.startsWith("v"));
  });

  test("groupSquadPresets groups valid and rejected by source kind", () => {
    const groups = groupSquadPresets(
      [preset("a", SquadPresetSourceKind.Marketplace), preset("b", SquadPresetSourceKind.ExternalRepo)],
      [rejected("bad", SquadPresetSourceKind.Marketplace)]
    );

    assert.strictEqual(groups.length, 2);
    const marketplace = groups.find((g) => g.key === SquadPresetSourceKind.Marketplace);
    assert.ok(marketplace);
    assert.strictEqual(marketplace.presets.length, 1);
    assert.strictEqual(marketplace.rejected.length, 1);
    assert.strictEqual(marketplace.rejected[0].name, "bad");

    const external = groups.find((g) => g.key === SquadPresetSourceKind.ExternalRepo);
    assert.ok(external);
    assert.strictEqual(external.presets.length, 1);
    assert.strictEqual(external.rejected.length, 0);
  });

  test("groupSquadPresets orders marketplace before external before local", () => {
    const groups = groupSquadPresets(
      [
        preset("l", SquadPresetSourceKind.Local),
        preset("e", SquadPresetSourceKind.ExternalRepo),
        preset("m", SquadPresetSourceKind.Marketplace),
      ],
      []
    );
    assert.deepStrictEqual(
      groups.map((g) => g.key),
      [SquadPresetSourceKind.Marketplace, SquadPresetSourceKind.ExternalRepo, SquadPresetSourceKind.Local]
    );
  });

  test("groupSquadPresets omits empty sources and returns [] for no input", () => {
    assert.deepStrictEqual(groupSquadPresets([], []), []);
  });

  test("countSelectablePresets sums only valid presets", () => {
    const groups = groupSquadPresets(
      [preset("a", SquadPresetSourceKind.Marketplace), preset("b", SquadPresetSourceKind.Marketplace)],
      [rejected("bad", SquadPresetSourceKind.Marketplace)]
    );
    assert.strictEqual(countSelectablePresets(groups), 2);
  });
});
