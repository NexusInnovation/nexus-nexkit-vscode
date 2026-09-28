/**
 * Tests for the Squad project version reader (SQD-006).
 *
 * Covers PRD FR-002: read the project Squad version from the
 * `<!-- version: x -->` stamp in `.github/agents/squad.agent.md`, with an
 * `unknown` state when the stamp is absent, a first-class `0.0.0-source`
 * state, and actionable errors for a missing file or a malformed stamp.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  SquadProjectFileReader,
  SquadProjectVersionReader,
  parseSquadProjectVersion,
} from "../../src/features/squad/squadProjectVersionReader";
import {
  SQUAD_SOURCE_VERSION,
  SquadProjectVersionKind,
  isSquadErr,
  isSquadOk,
} from "../../src/features/squad/models";

const ROOT = vscode.Uri.file("/tmp/workspace");
const AGENT_RELATIVE = ".github/agents/squad.agent.md";
const FIXTURE_DIR = path.resolve(__dirname, "../../../test/fixtures/squad");

/** Silent logger stub so tests don't create output channels. */
const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

/** Read a fixture's raw text from disk. */
function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

/** A file reader that serves the agent file from a fixture on disk. */
function fixtureReader(fixtureName: string): SquadProjectFileReader {
  const isAgent = (uri: vscode.Uri): boolean => uri.path.endsWith(AGENT_RELATIVE);
  return {
    async exists(uri: vscode.Uri): Promise<boolean> {
      return isAgent(uri);
    },
    async readFile(uri: vscode.Uri): Promise<string> {
      if (!isAgent(uri)) {
        throw new Error("ENOENT");
      }
      return fixture(fixtureName);
    },
  };
}

suite("Unit: SquadProjectVersionReader (SQD-006)", () => {
  suite("parseSquadProjectVersion (pure)", () => {
    test("Should parse a pinned semver stamp", () => {
      const result = parseSquadProjectVersion("<!-- version: 1.4.2 -->\n# agent");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Pinned);
        assert.strictEqual(result.value.version, "1.4.2");
        assert.strictEqual(result.value.raw, "1.4.2");
        assert.strictEqual(result.value.isSource, false);
      }
    });

    test("Should parse a semver with prerelease and build metadata", () => {
      const result = parseSquadProjectVersion("<!-- version: 2.0.0-beta.1+build.5 -->");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Pinned);
        assert.strictEqual(result.value.version, "2.0.0-beta.1+build.5");
      }
    });

    test("Should classify the 0.0.0-source sentinel as source, not comparable", () => {
      const result = parseSquadProjectVersion(`<!-- version: ${SQUAD_SOURCE_VERSION} -->`);
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Source);
        assert.strictEqual(result.value.isSource, true);
        assert.strictEqual(result.value.version, null);
        assert.strictEqual(result.value.raw, SQUAD_SOURCE_VERSION);
      }
    });

    test("Should return missing (unknown) when no stamp is present (FR-002)", () => {
      const result = parseSquadProjectVersion("# Squad agent\nNo stamp here.");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Missing);
        assert.strictEqual(result.value.version, null);
        assert.strictEqual(result.value.raw, null);
        assert.strictEqual(result.value.isSource, false);
      }
    });

    test("Should be case-insensitive and tolerate extra whitespace", () => {
      const result = parseSquadProjectVersion("<!--   VERSION:   3.1.0   -->");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.version, "3.1.0");
      }
    });

    test("Should fail with parse-failed for a malformed stamp (never fake success)", () => {
      const result = parseSquadProjectVersion("<!-- version: banana -->");
      assert.ok(isSquadErr(result));
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "parse-failed");
        assert.ok(result.error.remediation && result.error.remediation.length > 0);
        assert.ok(result.error.detail && result.error.detail.includes("banana"));
      }
    });

    test("Should reject an incomplete version like 1.2", () => {
      const result = parseSquadProjectVersion("<!-- version: 1.2 -->");
      assert.ok(isSquadErr(result));
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "parse-failed");
      }
    });
  });

  suite("SquadProjectVersionReader.read (fixtures)", () => {
    test("Should read a pinned version from the fixture", async () => {
      const reader = new SquadProjectVersionReader({
        fileReader: fixtureReader("squad.agent.pinned.md"),
        logger: silentLogger,
      });

      const result = await reader.read(ROOT);
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Pinned);
        assert.strictEqual(result.value.version, "1.4.2");
      }
    });

    test("Should read the 0.0.0-source sentinel from the fixture", async () => {
      const reader = new SquadProjectVersionReader({
        fileReader: fixtureReader("squad.agent.source.md"),
        logger: silentLogger,
      });

      const result = await reader.read(ROOT);
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Source);
        assert.strictEqual(result.value.isSource, true);
      }
    });

    test("Should report unknown (missing) for the no-stamp fixture", async () => {
      const reader = new SquadProjectVersionReader({
        fileReader: fixtureReader("squad.agent.nostamp.md"),
        logger: silentLogger,
      });

      const result = await reader.read(ROOT);
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Missing);
        assert.strictEqual(result.value.version, null);
      }
    });

    test("Should surface parse-failed for the malformed fixture", async () => {
      const reader = new SquadProjectVersionReader({
        fileReader: fixtureReader("squad.agent.malformed.md"),
        logger: silentLogger,
      });

      const result = await reader.read(ROOT);
      assert.ok(isSquadErr(result));
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "parse-failed");
      }
    });

    test("Should return file-read-failed when the agent file is missing", async () => {
      const missingReader: SquadProjectFileReader = {
        async exists(): Promise<boolean> {
          return false;
        },
        async readFile(): Promise<string> {
          throw new Error("ENOENT");
        },
      };
      const reader = new SquadProjectVersionReader({ fileReader: missingReader, logger: silentLogger });

      const result = await reader.read(ROOT);
      assert.ok(isSquadErr(result));
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "file-read-failed");
        assert.ok(result.error.remediation && result.error.remediation.length > 0);
      }
    });

    test("Should return file-read-failed when reading throws", async () => {
      const throwingReader: SquadProjectFileReader = {
        async exists(): Promise<boolean> {
          return true;
        },
        async readFile(): Promise<string> {
          throw new Error("EACCES: permission denied");
        },
      };
      const reader = new SquadProjectVersionReader({ fileReader: throwingReader, logger: silentLogger });

      const result = await reader.read(ROOT);
      assert.ok(isSquadErr(result));
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "file-read-failed");
        assert.ok(result.error.detail && result.error.detail.includes("EACCES"));
      }
    });
  });
});
