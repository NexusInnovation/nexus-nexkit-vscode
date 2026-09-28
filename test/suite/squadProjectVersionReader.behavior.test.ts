/**
 * Gap-filling behavior tests for the Squad project version reader (SQD-022).
 *
 * Complements the SQD-006 baseline suite (`squadProjectVersionReader.test.ts`)
 * by pinning down the version-stamp variants called out in issue #237:
 * pinned, prerelease/build metadata, the `0.0.0-source` sentinel, missing,
 * malformed, whitespace-only, CRLF line endings, and multiple/duplicate
 * stamps. These document behaviour (FR-002) against the public parser and
 * reader interfaces — never implementation details.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
  SquadProjectFileReader,
  SquadProjectVersionReader,
  parseSquadProjectVersion,
} from "../../src/features/squad/services/squadProjectVersionReader";
import {
  SQUAD_SOURCE_VERSION,
  SquadProjectVersionKind,
  isSquadErr,
  isSquadOk,
} from "../../src/features/squad/models";

const ROOT = vscode.Uri.file("/tmp/workspace");

/** Silent logger stub so tests don't create output channels. */
const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

/** A file reader that serves fixed in-memory content for the agent file. */
function contentReader(content: string, exists = true): SquadProjectFileReader {
  return {
    async exists(): Promise<boolean> {
      return exists;
    },
    async readFile(): Promise<string> {
      if (!exists) {
        throw new Error("ENOENT");
      }
      return content;
    },
  };
}

suite("Unit: SquadProjectVersionReader — stamp variants (SQD-022)", () => {
  suite("parseSquadProjectVersion — whitespace & line endings", () => {
    test("Should parse a stamp followed by a CRLF newline", () => {
      const result = parseSquadProjectVersion("<!-- version: 1.4.2 -->\r\n# agent\r\n");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Pinned);
        assert.strictEqual(result.value.version, "1.4.2");
      }
    });

    test("Should parse a stamp whose comment spans CRLF line breaks", () => {
      const result = parseSquadProjectVersion("<!--\r\n version: 1.2.3 \r\n-->");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.version, "1.2.3");
      }
    });

    test("Should parse a tab-delimited version token", () => {
      const result = parseSquadProjectVersion("<!-- version:\t2.5.0\t-->");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.version, "2.5.0");
      }
    });

    test("Should treat a whitespace-only token as missing (unknown), not an error", () => {
      const result = parseSquadProjectVersion("<!-- version:    -->");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Missing);
        assert.strictEqual(result.value.version, null);
        assert.strictEqual(result.value.raw, null);
      }
    });

    test("Should treat an empty token as missing (unknown), not an error", () => {
      const result = parseSquadProjectVersion("<!-- version: -->");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Missing);
      }
    });
  });

  suite("parseSquadProjectVersion — value classification", () => {
    test("Should honour the first stamp when several are present", () => {
      const result = parseSquadProjectVersion(
        "intro <!-- version: 1.0.0 --> body <!-- version: 2.0.0 -->",
      );
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.version, "1.0.0");
      }
    });

    test("Should classify the source sentinel even with surrounding whitespace", () => {
      const result = parseSquadProjectVersion(`<!--   version:   ${SQUAD_SOURCE_VERSION}   -->`);
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Source);
        assert.strictEqual(result.value.isSource, true);
        assert.strictEqual(result.value.version, null);
        assert.strictEqual(result.value.raw, SQUAD_SOURCE_VERSION);
      }
    });

    test("Should treat a differently-cased source token as a pinned prerelease, not the sentinel", () => {
      // The sentinel match is case-sensitive; `0.0.0-SOURCE` is a syntactically
      // valid semver prerelease, so it is pinned/comparable rather than source.
      const result = parseSquadProjectVersion("<!-- version: 0.0.0-SOURCE -->");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Pinned);
        assert.strictEqual(result.value.isSource, false);
        assert.strictEqual(result.value.version, "0.0.0-SOURCE");
      }
    });

    test("Should accept build metadata only (no prerelease)", () => {
      const result = parseSquadProjectVersion("<!-- version: 1.2.3+build.7 -->");
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.kind, SquadProjectVersionKind.Pinned);
        assert.strictEqual(result.value.version, "1.2.3+build.7");
      }
    });

    test("Should reject a leading-v version like v1.2.3 as malformed", () => {
      const result = parseSquadProjectVersion("<!-- version: v1.2.3 -->");
      assert.ok(isSquadErr(result));
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "parse-failed");
        assert.ok(result.error.detail && result.error.detail.includes("v1.2.3"));
      }
    });

    test("Should reject a four-part version like 1.2.3.4 as malformed", () => {
      const result = parseSquadProjectVersion("<!-- version: 1.2.3.4 -->");
      assert.ok(isSquadErr(result));
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "parse-failed");
      }
    });
  });

  suite("SquadProjectVersionReader.read — error paths", () => {
    test("Should surface file-read-failed when the existence check itself throws", async () => {
      const reader = new SquadProjectVersionReader({
        fileReader: {
          async exists(): Promise<boolean> {
            throw new Error("EACCES: permission denied");
          },
          async readFile(): Promise<string> {
            return "";
          },
        },
        logger: silentLogger,
      });

      const result = await reader.read(ROOT);
      assert.ok(isSquadErr(result));
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "file-read-failed");
        assert.ok(result.error.detail && result.error.detail.includes("EACCES"));
      }
    });

    test("Should read a CRLF-terminated pinned stamp end-to-end", async () => {
      const reader = new SquadProjectVersionReader({
        fileReader: contentReader("<!-- version: 3.9.1 -->\r\n# agent\r\n"),
        logger: silentLogger,
      });

      const result = await reader.read(ROOT);
      assert.ok(isSquadOk(result));
      if (isSquadOk(result)) {
        assert.strictEqual(result.value.version, "3.9.1");
      }
    });

    test("Should propagate parse-failed from read for a malformed stamp", async () => {
      const reader = new SquadProjectVersionReader({
        fileReader: contentReader("<!-- version: not-a-version -->"),
        logger: silentLogger,
      });

      const result = await reader.read(ROOT);
      assert.ok(isSquadErr(result));
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "parse-failed");
      }
    });
  });
});
