/**
 * Unit tests for {@link CompositeSquadPresetProvider} (SQD-018). Child providers
 * are lightweight fakes so the tests focus on aggregation and failure isolation:
 * a failing or throwing child must never hide the presets other children return.
 */

import * as assert from "assert";
import {
  SquadPreset,
  SquadPresetDiscovery,
  SquadPresetProvider,
} from "../../src/features/squad/models";
import { squadErr, SquadResult } from "../../src/features/squad/models/squadResult";
import { CompositeSquadPresetProvider } from "../../src/features/squad/services/compositeSquadPresetProvider";

function preset(id: string, pluginId: string, kind: SquadPreset["source"]["kind"]): SquadPreset {
  return {
    id,
    name: id,
    source: { kind, pluginId, squadFolderPath: "squad" },
    version: "1",
  };
}

/** A fake provider returning a fixed outcome (value or error, or throwing). */
class FakeProvider implements SquadPresetProvider {
  constructor(
    public readonly id: string,
    public readonly label: string,
    private readonly _outcome:
      | { kind: "ok"; value: SquadPresetDiscovery }
      | { kind: "err" }
      | { kind: "throw" },
  ) {}

  public async discoverPresets(): Promise<SquadResult<SquadPresetDiscovery>> {
    if (this._outcome.kind === "throw") {
      throw new Error("boom");
    }
    if (this._outcome.kind === "err") {
      return squadErr({
        code: "preset-fetch-failed",
        message: `${this.label} is unavailable.`,
        remediation: "Retry later.",
      });
    }
    return { ok: true, value: this._outcome.value };
  }
}

suite("CompositeSquadPresetProvider (SQD-018)", () => {
  test("merges presets from all child providers", async () => {
    const local = new FakeProvider("nexus-marketplace", "Local", {
      kind: "ok",
      value: { presets: [preset("team-firebolt", "firebolt", "marketplace")], rejected: [] },
    });
    const external = new FakeProvider("external-repos", "External", {
      kind: "ok",
      value: { presets: [preset("team-greffondors", "greffondors", "external-repo")], rejected: [] },
    });
    const composite = new CompositeSquadPresetProvider([local, external]);

    const result = await composite.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 2);
    const ids = result.value.presets.map((p) => p.id).sort();
    assert.deepStrictEqual(ids, ["team-firebolt", "team-greffondors"]);
    assert.strictEqual(result.value.unreachable, undefined);
  });

  test("a failing child provider does not hide the healthy one", async () => {
    const healthy = new FakeProvider("nexus-marketplace", "Local", {
      kind: "ok",
      value: { presets: [preset("team-firebolt", "firebolt", "marketplace")], rejected: [] },
    });
    const failing = new FakeProvider("external-repos", "External", { kind: "err" });
    const composite = new CompositeSquadPresetProvider([healthy, failing]);

    const result = await composite.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
    assert.strictEqual(result.value.presets[0].id, "team-firebolt");
    assert.ok(result.value.unreachable && result.value.unreachable.length === 1);
    assert.strictEqual(result.value.unreachable![0].sourceId, "external-repos");
    assert.strictEqual(result.value.unreachable![0].error.code, "preset-fetch-failed");
  });

  test("a throwing child provider is isolated as an unreachable source", async () => {
    const healthy = new FakeProvider("nexus-marketplace", "Local", {
      kind: "ok",
      value: { presets: [preset("team-firebolt", "firebolt", "marketplace")], rejected: [] },
    });
    const boom = new FakeProvider("external-repos", "External", { kind: "throw" });
    const composite = new CompositeSquadPresetProvider([healthy, boom]);

    const result = await composite.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
    assert.ok(result.value.unreachable && result.value.unreachable.length === 1);
    assert.strictEqual(result.value.unreachable![0].sourceId, "external-repos");
    assert.strictEqual(result.value.unreachable![0].error.code, "unknown");
  });

  test("propagates rejected presets and per-source unreachable entries from children", async () => {
    const local = new FakeProvider("nexus-marketplace", "Local", {
      kind: "ok",
      value: {
        presets: [],
        rejected: [
          {
            pluginId: "broken",
            source: { kind: "marketplace", pluginId: "broken", squadFolderPath: "squad" },
            diagnostics: [
              {
                code: "required-file-missing",
                severity: "error",
                message: "missing team.md",
              },
            ],
          },
        ],
      },
    });
    const external = new FakeProvider("external-repos", "External", {
      kind: "ok",
      value: {
        presets: [preset("team-greffondors", "greffondors", "external-repo")],
        rejected: [],
        unreachable: [
          {
            sourceId: "private-team",
            label: "private-team",
            error: { code: "preset-fetch-failed", message: "no access" },
          },
        ],
      },
    });
    const composite = new CompositeSquadPresetProvider([local, external]);

    const result = await composite.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.value.presets.length, 1);
    assert.strictEqual(result.value.rejected.length, 1);
    assert.strictEqual(result.value.rejected[0].pluginId, "broken");
    assert.ok(result.value.unreachable && result.value.unreachable.length === 1);
    assert.strictEqual(result.value.unreachable![0].sourceId, "private-team");
  });

  test("returns an empty, successful discovery when there are no child providers", async () => {
    const composite = new CompositeSquadPresetProvider([]);

    const result = await composite.discoverPresets();

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepStrictEqual(result.value.presets, []);
    assert.deepStrictEqual(result.value.rejected, []);
    assert.strictEqual(result.value.unreachable, undefined);
  });
});
