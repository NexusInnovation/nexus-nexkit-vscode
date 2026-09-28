/**
 * Behavior-focused unit tests for the Squad preset contract validator
 * (SQD-023 / #238). These complement the baseline suite in
 * `squadPresetValidator.test.ts` (SQD-015) and exercise the "Contrat du preset
 * Squad Nexus" (PRD FR-010/FR-011/FR-012/FR-013) against every documented
 * failure mode: valid presets, each missing required file/folder, malformed
 * content, extra/unexpected files, path traversal and absolute paths, case
 * sensitivity and Windows separators, empty input, and — critically — that
 * failures are always visible and carry actionable remediation.
 *
 * The validator is pure and `vscode`-free, so these tests assert on behavior
 * (diagnostic codes, severities, messages, remediation) rather than on
 * implementation details.
 */

import * as assert from "assert";
import {
  buildSquadPreset,
  validateSquadPreset,
  validateSquadPresetAsResult,
  SquadPresetValidationInput,
} from "../../src/features/squad/validation/squadPresetValidator";
import {
  SquadPresetDiagnostic,
  SquadPresetManifest,
} from "../../src/features/squad/models/squadPresetValidation";

/** A minimal, well-formed manifest object. */
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

/** Only error-severity diagnostics. */
function errorsOf(diagnostics: SquadPresetDiagnostic[]): SquadPresetDiagnostic[] {
  return diagnostics.filter((d) => d.severity === "error");
}

/** Only diagnostics with the given code. */
function withCode(diagnostics: SquadPresetDiagnostic[], code: string): SquadPresetDiagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

suite("Unit: Squad Preset Validator — behavior (SQD-023)", () => {
  // ---------------------------------------------------------------------------
  // Valid presets
  // ---------------------------------------------------------------------------
  suite("Valid presets", () => {
    test("Should accept the canonical preset with no diagnostics at all", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS));

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.diagnostics, []);
    });

    test("Should accept a minimal preset (manifest + baseline team.md only)", () => {
      const manifest = validManifest({ files: { required: [] } });
      const result = validateSquadPreset(inputWith(["manifest.json", "team.md"], manifest));

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.diagnostics, []);
    });

    test("Should accept a preset without a manifest files block", () => {
      const manifest = validManifest();
      delete (manifest as { files?: unknown }).files;
      const result = validateSquadPreset(inputWith(["manifest.json", "team.md"], manifest));

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(errorsOf(result.diagnostics), []);
    });

    test("Should accept a preset that omits the optional description field", () => {
      const manifest = validManifest();
      delete (manifest as { description?: unknown }).description;
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, manifest));

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.manifest?.description, undefined);
    });

    test("Should satisfy a required '**' glob with a deeply nested file", () => {
      const manifest = validManifest({ files: { required: ["team.md", "skills/**"] } });
      const paths = ["manifest.json", "team.md", "skills/deploy/steps/SKILL.md"];
      const result = validateSquadPreset(inputWith(paths, manifest));

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(withCode(result.diagnostics, "required-file-missing"), []);
    });

    test("Should treat leading './' path segments as squad/-relative", () => {
      const paths = HAPPY_PATHS.map((p) => `./${p}`);
      const result = validateSquadPreset(inputWith(paths));

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.diagnostics, []);
    });
  });

  // ---------------------------------------------------------------------------
  // Each missing required file / folder
  // ---------------------------------------------------------------------------
  suite("Missing required files", () => {
    for (const required of ["team.md", "routing.md"]) {
      test(`Should flag the specific missing required file "${required}"`, () => {
        const paths = HAPPY_PATHS.filter((p) => p !== required);
        const result = validateSquadPreset(inputWith(paths));

        assert.strictEqual(result.valid, false);
        const missing = withCode(result.diagnostics, "required-file-missing");
        assert.ok(
          missing.some((d) => d.path === required),
          `expected a required-file-missing diagnostic for ${required}`,
        );
      });
    }

    test("Should flag a missing required folder (agents/*/charter.md)", () => {
      const paths = HAPPY_PATHS.filter((p) => !p.startsWith("agents/"));
      const result = validateSquadPreset(inputWith(paths));

      assert.strictEqual(result.valid, false);
      assert.ok(
        withCode(result.diagnostics, "required-file-missing").some(
          (d) => d.path === "agents/*/charter.md",
        ),
      );
    });

    test("Should not accept a partial glob match with a missing middle segment", () => {
      const manifest = validManifest({ files: { required: ["team.md", "agents/*/charter.md"] } });
      // charter.md exists but directly under agents/, not agents/<name>/charter.md.
      const paths = ["manifest.json", "team.md", "agents/charter.md"];
      const result = validateSquadPreset(inputWith(paths, manifest));

      assert.strictEqual(result.valid, false);
      assert.ok(
        withCode(result.diagnostics, "required-file-missing").some(
          (d) => d.path === "agents/*/charter.md",
        ),
      );
    });

    test("Should report each unsatisfied required pattern independently", () => {
      const manifest = validManifest({
        files: { required: ["team.md", "routing.md", "playbook.md"] },
      });
      const result = validateSquadPreset(inputWith(["manifest.json"], manifest));

      const missingPaths = withCode(result.diagnostics, "required-file-missing").map((d) => d.path);
      assert.ok(missingPaths.includes("team.md"));
      assert.ok(missingPaths.includes("routing.md"));
      assert.ok(missingPaths.includes("playbook.md"));
    });
  });

  // ---------------------------------------------------------------------------
  // Malformed content
  // ---------------------------------------------------------------------------
  suite("Malformed content", () => {
    test("Should flag a manifest that is a JSON array", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, "[]"));

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-invalid-json").length > 0);
    });

    test("Should flag a manifest that is a bare JSON number", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, "42"));

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-invalid-json").length > 0);
    });

    test("Should flag a manifest that is JSON null", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, "null"));

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-invalid-json").length > 0);
    });

    test("Should flag a manifest that is a bare JSON string", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, '"just-a-string"'));

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-invalid-json").length > 0);
    });

    test("Should flag truncated / syntactically invalid JSON", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, '{ "id": "x", '));

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-invalid-json").length > 0);
    });

    test("Should flag a non-numeric schemaVersion as a missing field", () => {
      const manifest = { schemaVersion: "1", id: "x", displayName: "X" } as unknown as string;
      const result = validateSquadPreset(
        inputWith(["manifest.json", "team.md"], JSON.stringify(manifest)),
      );

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.diagnostics.some(
          (d) => d.code === "manifest-field-missing" && /schemaVersion/i.test(d.message),
        ),
      );
    });

    test("Should flag a whitespace-only id as missing", () => {
      const manifest = validManifest({ id: "   " });
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, manifest));

      assert.strictEqual(result.valid, false);
      assert.ok(
        withCode(result.diagnostics, "manifest-field-missing").some((d) =>
          /"id"/.test(d.message),
        ),
      );
    });

    test("Should flag both missing identity fields separately", () => {
      const manifest = { schemaVersion: 1 } as unknown as string;
      const result = validateSquadPreset(
        inputWith(["manifest.json", "team.md"], JSON.stringify(manifest)),
      );

      const fieldIssues = withCode(result.diagnostics, "manifest-field-missing");
      assert.ok(fieldIssues.some((d) => /"id"/.test(d.message)));
      assert.ok(fieldIssues.some((d) => /"displayName"/.test(d.message)));
    });

    test("Should tolerate non-string entries in files.required without crashing", () => {
      const manifest = {
        schemaVersion: 1,
        id: "x",
        displayName: "X",
        files: { required: ["team.md", 42, null, ""] },
      } as unknown as string;
      const result = validateSquadPreset(
        inputWith(["manifest.json", "team.md"], JSON.stringify(manifest)),
      );

      // Only the valid "team.md" pattern is enforced; it is present, so valid.
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(withCode(result.diagnostics, "required-file-missing"), []);
    });

    test("Should surface an unsupported schemaVersion with actionable remediation", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS, validManifest({ schemaVersion: 2 })));

      const issue = withCode(result.diagnostics, "manifest-schema-unsupported")[0];
      assert.ok(issue, "expected a manifest-schema-unsupported diagnostic");
      assert.ok(issue.remediation && issue.remediation.length > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Extra / unexpected files
  // ---------------------------------------------------------------------------
  suite("Extra and unexpected files", () => {
    test("Should accept extra Markdown/JSON files without any diagnostic", () => {
      const paths = [...HAPPY_PATHS, "extra.md", "config.json", "docs/guide.md"];
      const result = validateSquadPreset(inputWith(paths));

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.diagnostics, []);
    });

    test("Should warn (not fail) on an unexpected extension", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "assets/logo.png"]));

      assert.strictEqual(result.valid, true);
      assert.ok(
        withCode(result.diagnostics, "unexpected-extension").some(
          (d) => d.severity === "warning" && d.path === "assets/logo.png",
        ),
      );
    });

    test("Should emit one warning per unexpected file", () => {
      const paths = [...HAPPY_PATHS, "a.png", "b.svg", "c.yml"];
      const result = validateSquadPreset(inputWith(paths));

      const warnings = withCode(result.diagnostics, "unexpected-extension");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(warnings.length, 3);
    });

    test("Should accept extension-less files (e.g. LICENSE) silently", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "LICENSE"]));

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(withCode(result.diagnostics, "unexpected-extension"), []);
    });

    test("Should accept dotfiles (e.g. .gitignore) without a warning", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, ".gitignore"]));

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(withCode(result.diagnostics, "unexpected-extension"), []);
    });
  });

  // ---------------------------------------------------------------------------
  // Path traversal / absolute paths / dangerous content
  // ---------------------------------------------------------------------------
  suite("Path safety", () => {
    test("Should reject a POSIX-absolute path", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "/etc/passwd"]));

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "absolute-path").length > 0);
    });

    test("Should reject a Windows drive-absolute path (forward slash)", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "C:/Windows/win.md"]));

      assert.ok(withCode(result.diagnostics, "absolute-path").length > 0);
    });

    test("Should reject a Windows drive-absolute path (backslash)", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "D:\\team\\secret.md"]));

      assert.ok(withCode(result.diagnostics, "absolute-path").length > 0);
    });

    test("Should reject a UNC-style path once normalized", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "\\\\server\\share\\x.md"]));

      assert.ok(withCode(result.diagnostics, "absolute-path").length > 0);
    });

    test("Should reject a leading-slash traversal", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "../secrets.md"]));

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "path-traversal").length > 0);
    });

    test("Should reject a mid-path '..' traversal segment", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "agents/../../escape.md"]));

      assert.ok(withCode(result.diagnostics, "path-traversal").length > 0);
    });

    for (const dangerous of ["tools/install.sh", "setup.ps1", "run.bat", "malware.exe"]) {
      test(`Should reject the dangerous file "${dangerous}"`, () => {
        const result = validateSquadPreset(inputWith([...HAPPY_PATHS, dangerous]));

        assert.strictEqual(result.valid, false);
        assert.ok(
          withCode(result.diagnostics, "dangerous-extension").some((d) => d.path === dangerous),
        );
      });
    }

    test("Should reject a symlinked path", () => {
      const result = validateSquadPreset(
        inputWith(HAPPY_PATHS, validManifest(), { symlinkPaths: ["agents/link/history.md"] }),
      );

      assert.strictEqual(result.valid, false);
      assert.ok(
        withCode(result.diagnostics, "symlink").some((d) => d.path === "agents/link/history.md"),
      );
    });

    test("Should report only the first blocking issue per offending path", () => {
      // Absolute AND dangerous extension: absolute check wins, one diagnostic.
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "/tmp/run.sh"]));

      const forPath = result.diagnostics.filter((d) => d.path === "/tmp/run.sh");
      assert.strictEqual(forPath.length, 1);
      assert.strictEqual(forPath[0].code, "absolute-path");
    });
  });

  // ---------------------------------------------------------------------------
  // Case sensitivity & Windows separators
  // ---------------------------------------------------------------------------
  suite("Case sensitivity and separators", () => {
    test("Should normalize backslash separators when matching required globs", () => {
      const paths = ["manifest.json", "team.md", "routing.md", "agents\\link\\charter.md"];
      const result = validateSquadPreset(inputWith(paths));

      assert.deepStrictEqual(withCode(result.diagnostics, "required-file-missing"), []);
    });

    test("Should treat manifest.json case-sensitively (Manifest.json is not the manifest)", () => {
      const paths = ["Manifest.json", "team.md", "routing.md", "agents/link/charter.md"];
      const result = validateSquadPreset(inputWith(paths));

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-missing").length > 0);
    });

    test("Should treat required file names case-sensitively (Team.md != team.md)", () => {
      const manifest = validManifest({ files: { required: ["team.md"] } });
      const result = validateSquadPreset(inputWith(["manifest.json", "Team.md"], manifest));

      assert.strictEqual(result.valid, false);
      assert.ok(
        withCode(result.diagnostics, "required-file-missing").some((d) => d.path === "team.md"),
      );
    });

    test("Should lower-case extensions so an upper-case .EXE is still dangerous", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "tools/RUN.EXE"]));

      assert.strictEqual(result.valid, false);
      assert.ok(
        withCode(result.diagnostics, "dangerous-extension").some((d) => d.path === "tools/RUN.EXE"),
      );
    });

    test("Should lower-case extensions so an upper-case .SVG is an unexpected warning", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "assets/LOGO.SVG"]));

      assert.strictEqual(result.valid, true);
      assert.ok(
        withCode(result.diagnostics, "unexpected-extension").some(
          (d) => d.path === "assets/LOGO.SVG",
        ),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Empty / degenerate input
  // ---------------------------------------------------------------------------
  suite("Empty and degenerate input", () => {
    test("Should fail an empty listing with a single actionable diagnostic", () => {
      const result = validateSquadPreset({ paths: [] });

      assert.strictEqual(result.valid, false);
      const empty = withCode(result.diagnostics, "empty-listing");
      assert.strictEqual(empty.length, 1);
      assert.ok(empty[0].remediation && empty[0].remediation.length > 0);
    });

    test("Should short-circuit an empty listing without checking required files", () => {
      const result = validateSquadPreset({ paths: [] });

      assert.deepStrictEqual(withCode(result.diagnostics, "required-file-missing"), []);
      assert.deepStrictEqual(withCode(result.diagnostics, "manifest-missing"), []);
    });

    test("Should flag manifest-missing when the listing has files but no manifest", () => {
      const result = validateSquadPreset(inputWith(["team.md", "routing.md"]));

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-missing").length > 0);
    });

    test("Should not attempt manifest parsing without a reader", () => {
      const result = validateSquadPreset({ paths: HAPPY_PATHS });

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-unreadable").length > 0);
      assert.deepStrictEqual(withCode(result.diagnostics, "manifest-invalid-json"), []);
    });

    test("Should flag manifest-unreadable when the reader returns undefined for it", () => {
      const readTextFile = (relativePath: string): string | undefined =>
        relativePath === "manifest.json" ? undefined : "content";
      const result = validateSquadPreset({ paths: HAPPY_PATHS, readTextFile });

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-unreadable").length > 0);
    });

    test("Should treat a reader that throws on the manifest as unreadable", () => {
      const readTextFile = (relativePath: string): string | undefined => {
        if (relativePath === "manifest.json") {
          throw new Error("boom");
        }
        return "content";
      };
      const result = validateSquadPreset({ paths: HAPPY_PATHS, readTextFile });

      assert.strictEqual(result.valid, false);
      assert.ok(withCode(result.diagnostics, "manifest-unreadable").length > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Actionable, non-silent error reporting
  // ---------------------------------------------------------------------------
  suite("Actionable, visible failures", () => {
    test("Every error diagnostic should carry a non-empty message and remediation", () => {
      const paths = [
        "team.md",
        "/abs/secret.md",
        "agents/../../escape.md",
        "tools/install.sh",
      ];
      const result = validateSquadPreset(
        inputWith(paths, validManifest({ schemaVersion: 77, id: "" }), {
          symlinkPaths: ["team.md"],
        }),
      );

      const errors = errorsOf(result.diagnostics);
      assert.ok(errors.length >= 4, "expected multiple blocking diagnostics");
      for (const error of errors) {
        assert.ok(error.message && error.message.trim().length > 0, `empty message for ${error.code}`);
        assert.ok(
          error.remediation && error.remediation.trim().length > 0,
          `missing remediation for ${error.code}`,
        );
      }
    });

    test("Path-scoped diagnostics should name the offending path in the message", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "tools/install.sh"]));

      const issue = withCode(result.diagnostics, "dangerous-extension")[0];
      assert.ok(issue);
      assert.ok(issue.message.includes("tools/install.sh"));
    });

    test("Should never report valid:true while any error diagnostic exists", () => {
      const paths = HAPPY_PATHS.filter((p) => p !== "team.md");
      const result = validateSquadPreset(inputWith(paths));

      assert.strictEqual(errorsOf(result.diagnostics).length > 0, true);
      assert.strictEqual(result.valid, false);
    });

    test("Should report valid:true when only warnings exist", () => {
      const result = validateSquadPreset(inputWith([...HAPPY_PATHS, "notes.txt"]));

      assert.ok(result.diagnostics.every((d) => d.severity === "warning"));
      assert.strictEqual(result.valid, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Secret scanning (constructed at runtime to avoid literal secrets)
  // ---------------------------------------------------------------------------
  suite("Secret scanning", () => {
    test("Should warn (not fail) when a Markdown file embeds a token-like string", () => {
      // Built at runtime so no literal token is committed to the repo.
      const fakeToken = "ghp_" + "A".repeat(32);
      const readTextFile = (relativePath: string): string | undefined => {
        if (relativePath === "manifest.json") {
          return JSON.stringify(validManifest());
        }
        if (relativePath === "team.md") {
          return `Roster owner key: ${fakeToken}`;
        }
        return "clean content";
      };
      const result = validateSquadPreset({ paths: HAPPY_PATHS, readTextFile });

      assert.strictEqual(result.valid, true);
      assert.ok(
        withCode(result.diagnostics, "potential-secret").some((d) => d.severity === "warning"),
      );
    });

    test("Should warn when a file contains a private key block header", () => {
      const readTextFile = (relativePath: string): string | undefined => {
        if (relativePath === "manifest.json") {
          return JSON.stringify(validManifest());
        }
        if (relativePath === "routing.md") {
          return "-----BEGIN RSA PRIVATE KEY-----\nMII...\n-----END RSA PRIVATE KEY-----";
        }
        return "clean";
      };
      const result = validateSquadPreset({ paths: HAPPY_PATHS, readTextFile });

      assert.strictEqual(result.valid, true);
      assert.ok(withCode(result.diagnostics, "potential-secret").length > 0);
    });

    test("Should not flag clean content as a secret", () => {
      const result = validateSquadPreset(inputWith(HAPPY_PATHS));

      assert.deepStrictEqual(withCode(result.diagnostics, "potential-secret"), []);
    });

    test("Should only scan Markdown/JSON content, not other file types", () => {
      const fakeToken = "ghp_" + "B".repeat(32);
      const readTextFile = (relativePath: string): string | undefined => {
        if (relativePath === "manifest.json") {
          return JSON.stringify(validManifest());
        }
        if (relativePath === "notes.png") {
          return `binary-ish ${fakeToken}`;
        }
        return "clean";
      };
      const result = validateSquadPreset({ paths: [...HAPPY_PATHS, "notes.png"], readTextFile });

      assert.deepStrictEqual(withCode(result.diagnostics, "potential-secret"), []);
    });
  });

  // ---------------------------------------------------------------------------
  // SquadResult adapter + buildSquadPreset
  // ---------------------------------------------------------------------------
  suite("Result adapter and descriptor", () => {
    test("Should enumerate every blocking diagnostic in the failure detail", () => {
      const paths = HAPPY_PATHS.filter((p) => p !== "manifest.json" && p !== "team.md");
      const result = validateSquadPresetAsResult(inputWith(paths));

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, "preset-invalid");
        assert.ok(result.error.detail && result.error.detail.includes("manifest-missing"));
        assert.ok(result.error.detail && result.error.detail.includes("required-file-missing"));
      }
    });

    test("Should carry the first blocking diagnostic's remediation on failure", () => {
      const result = validateSquadPresetAsResult({ paths: [] });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.remediation && result.error.remediation.length > 0);
      }
    });

    test("Should return ok with a fully built descriptor on success", () => {
      const result = validateSquadPresetAsResult(inputWith(HAPPY_PATHS));

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.id, "team-firebolt");
        assert.strictEqual(result.value.name, "Firebolt Squad");
        assert.strictEqual(result.value.version, "1");
        assert.strictEqual(result.value.description, "Preset Squad pour l'équipe Firebolt.");
      }
    });

    test("buildSquadPreset should include the repository when the manifest declares one", () => {
      const manifest = validManifest({
        source: { type: "external", pluginId: "greffondors", repository: "NexusInnovation/greffondors" },
      });
      const preset = buildSquadPreset(manifest);

      assert.strictEqual(preset.source.kind, "marketplace");
      assert.strictEqual(preset.source.pluginId, "greffondors");
      assert.strictEqual(preset.source.repository, "NexusInnovation/greffondors");
      assert.strictEqual(preset.source.squadFolderPath, "squad");
    });

    test("buildSquadPreset should fall back to the manifest id when no source pluginId is set", () => {
      const manifest = validManifest({ source: undefined });
      const preset = buildSquadPreset(manifest);

      assert.strictEqual(preset.source.pluginId, "team-firebolt");
    });
  });
});
