/**
 * Tests for the Squad preset contract validator (SQD-015).
 */

import * as assert from "assert";
import {
  buildSquadPreset,
  validateSquadPreset,
  validateSquadPresetAsResult,
  SquadPresetValidationInput,
} from "../../src/features/squad/validation/squadPresetValidator";
import { SquadPresetManifest } from "../../src/features/squad/models/squadPresetValidation";

/** A minimal valid manifest object. */
function validManifest(overrides: Partial<SquadPresetManifest> = {}): SquadPresetManifest {
  return {
    schemaVersion: 1,
    id: "team-firebolt",
    displayName: "Firebolt Squad",
    description: "Preset Squad pour l'équipe Firebolt.",
    level: "team",
    source: { type: "marketplace-plugin", pluginId: "firebolt" },
    files: {
      required: ["team.md", "routing.md", "agents/*/charter.md"],
      optional: ["decisions.md", "skills/**"],
    },
    ...overrides,
  };
}

/** Build an input whose reader serves the given manifest object as JSON. */
function inputWith(
  paths: string[],
  manifest: SquadPresetManifest | string | undefined = validManifest(),
  extra: Partial<SquadPresetValidationInput> = {},
): SquadPresetValidationInput {
  const readTextFile = (relativePath: string): string | undefined => {
    if (relativePath === "manifest.json") {
      if (manifest === undefined) {
        return undefined;
      }
      return typeof manifest === "string" ? manifest : JSON.stringify(manifest);
    }
    return "placeholder content";
  };
  return { paths, readTextFile, ...extra };
}

const HAPPY_PATHS = [
  "manifest.json",
  "team.md",
  "routing.md",
  "decisions.md",
  "agents/link/charter.md",
  "agents/link/history.md",
  "skills/deploy/SKILL.md",
];

suite("Unit: Squad Preset Validator", () => {
  suite("Happy path", () => {
    test("Should accept a well-formed preset", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS));

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(
        result.diagnostics.filter((d) => d.severity === "error"),
        [],
      );
      assert.ok(result.manifest);
      assert.strictEqual(result.manifest?.id, "team-firebolt");
    });

    test("Should satisfy a glob required file via a nested match", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS));
      const missing = result.diagnostics.filter((d) => d.code === "required-file-missing");

      assert.deepStrictEqual(missing, []);
    });
  });

  suite("Manifest validation", () => {
    test("Should flag a missing manifest.json", () => {
      const paths = HAPPY_PATHS.filter((p) => p !== "manifest.json");
      const result = validateSquadPreset(inputWith(paths));

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "manifest-missing"));
    });

    test("Should flag an unreadable manifest when no reader is provided", () => {
      const result = validateSquadPreset({ paths: HAPPY_PATHS });

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "manifest-unreadable"));
    });

    test("Should flag invalid JSON", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, "{ not json"));

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "manifest-invalid-json"));
    });

    test("Should flag a non-object manifest", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, "[]"));

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "manifest-invalid-json"));
    });

    test("Should flag an unsupported schemaVersion", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, validManifest({ schemaVersion: 99 })));

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "manifest-schema-unsupported"));
    });

    test("Should flag missing identity fields", () => {
      const manifest = { schemaVersion: 1, files: { required: [] } } as unknown as SquadPresetManifest;
      const result = validateSquadPreset(inputWith(["manifest.json", "team.md"], manifest));

      const fieldIssues = result.diagnostics.filter((d) => d.code === "manifest-field-missing");
      assert.strictEqual(result.valid, false);
      assert.ok(fieldIssues.length >= 2);
    });
  });

  suite("Required files", () => {
    test("Should flag a missing manifest-declared required file", () => {
      const paths = HAPPY_PATHS.filter((p) => p !== "routing.md");
      const result = validateSquadPreset(inputWith(paths));

      assert.strictEqual(result.valid, false);
      const missing = result.diagnostics.filter((d) => d.code === "required-file-missing");
      assert.ok(missing.some((d) => d.path === "routing.md"));
    });

    test("Should flag a missing baseline team.md even if manifest omits it", () => {
      const manifest = validManifest({ files: { required: [] } });
      const result = validateSquadPreset(inputWith(["manifest.json", "routing.md"], manifest));

      assert.ok(
        result.diagnostics.some(
          (d) => d.code === "required-file-missing" && d.path === "team.md",
        ),
      );
    });

    test("Should flag an unsatisfied glob required file", () => {
      const paths = HAPPY_PATHS.filter((p) => !p.startsWith("agents/"));
      const result = validateSquadPreset(inputWith(paths));

      assert.ok(
        result.diagnostics.some(
          (d) => d.code === "required-file-missing" && d.path === "agents/*/charter.md",
        ),
      );
    });
  });

  suite("Path safety", () => {
    test("Should reject absolute paths", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "/etc/passwd"]));

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "absolute-path"));
    });

    test("Should reject Windows drive-absolute paths", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "C:/Users/link/secret.md"]));

      assert.ok(result.diagnostics.some((d) => d.code === "absolute-path"));
    });

    test("Should reject parent-directory traversal", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "../../escape.md"]));

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "path-traversal"));
    });

    test("Should reject dangerous executable extensions", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "tools/install.sh"]));

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "dangerous-extension"));
    });

    test("Should reject symlinks", () => {
      const result = validateSquadPreset(
        inputWith(HAPPY_PATHS, validManifest(), { symlinkPaths: ["team.md"] }),
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "symlink"));
    });

    test("Should warn (not fail) on unexpected but harmless extensions", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "notes/diagram.svg"]));

      assert.strictEqual(result.valid, true);
      assert.ok(
        result.diagnostics.some(
          (d) => d.code === "unexpected-extension" && d.severity === "warning",
        ),
      );
    });

    test("Should normalise backslash separators", () => {
      const paths = [
        "manifest.json",
        "team.md",
        "routing.md",
        "agents\\link\\charter.md",
      ];
      const result = validateSquadPreset(inputWith(paths));

      assert.deepStrictEqual(
        result.diagnostics.filter((d) => d.code === "required-file-missing"),
        [],
      );
    });
  });

  suite("Empty listing", () => {
    test("Should fail on an empty listing", () => {
      const result = validateSquadPreset({ paths: [] });

      assert.strictEqual(result.valid, false);
      assert.ok(result.diagnostics.some((d) => d.code === "empty-listing"));
    });
  });

  suite("Secret scanning", () => {
    test("Should warn when a file contains a token", () => {
      const readTextFile = (relativePath: string): string | undefined => {
        if (relativePath === "manifest.json") {
          return JSON.stringify(validManifest());
        }
        if (relativePath === "team.md") {
          return "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789";
        }
        return "placeholder";
      };
      const result = validateSquadPreset({ paths: HAPPY_PATHS, readTextFile });

      assert.strictEqual(result.valid, true);
      assert.ok(
        result.diagnostics.some(
          (d) => d.code === "potential-secret" && d.severity === "warning",
        ),
      );
    });
  });

  suite("SquadResult adapter", () => {
    test("Should return ok with a built preset on success", () => {
      const result = validateSquadPresetAsResult(inputWith(HAPPY_PATHS));

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.id, "team-firebolt");
        assert.strictEqual(result.value.name, "Firebolt Squad");
        assert.strictEqual(result.value.version, "1");
      }
    });

    test("Should return preset-invalid with actionable detail on failure", () => {
      const paths = HAPPY_PATHS.filter((p) => p !== "manifest.json");
      const result = validateSquadPresetAsResult(inputWith(paths));

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "preset-invalid");
        assert.ok(result.error.message.length > 0);
        assert.ok(result.error.detail && result.error.detail.includes("manifest-missing"));
      }
    });

    test("Should honour a caller-supplied source", () => {
      const source = {
        kind: "external-repo" as const,
        pluginId: "greffondors",
        repository: "NexusInnovation/greffondors",
        squadFolderPath: "squad",
      };
      const result = validateSquadPresetAsResult(inputWith(HAPPY_PATHS, validManifest(), { source }));

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.deepStrictEqual(result.value.source, source);
      }
    });
  });

  suite("buildSquadPreset", () => {
    test("Should derive a marketplace source from the manifest when none is given", () => {
      const preset = buildSquadPreset(validManifest());

      assert.strictEqual(preset.source.kind, "marketplace");
      assert.strictEqual(preset.source.pluginId, "firebolt");
    });
  });
});
