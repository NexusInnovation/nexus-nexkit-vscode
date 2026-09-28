/**
 * Tests for the pure Squad view formatting helpers (SQD-012/013/014).
 *
 * These helpers back the read-only Squad panel views (roster, governance,
 * logs). They are Preact-free and safe to unit test in the extension-host
 * runner.
 */

import * as assert from "assert";
import {
  baseName,
  formatBytes,
  truncationNotice,
} from "../../src/features/panel-ui/webview/utils/squadFormat";

suite("Unit: Squad Format Helpers", () => {
  suite("formatBytes", () => {
    test("Should render bytes below 1 KB with a B suffix", () => {
      assert.strictEqual(formatBytes(0), "0 B");
      assert.strictEqual(formatBytes(512), "512 B");
      assert.strictEqual(formatBytes(1023), "1023 B");
    });

    test("Should render kilobytes and megabytes", () => {
      assert.strictEqual(formatBytes(1024), "1 KB");
      assert.strictEqual(formatBytes(256 * 1024), "256 KB");
      assert.strictEqual(formatBytes(1024 * 1024), "1 MB");
    });

    test("Should keep one decimal for small non-integer values", () => {
      assert.strictEqual(formatBytes(1536), "1.5 KB");
    });

    test("Should return 'unknown size' for missing or invalid input", () => {
      assert.strictEqual(formatBytes(undefined), "unknown size");
      assert.strictEqual(formatBytes(null), "unknown size");
      assert.strictEqual(formatBytes(-1), "unknown size");
      assert.strictEqual(formatBytes(Number.NaN), "unknown size");
    });
  });

  suite("baseName", () => {
    test("Should extract the file name from POSIX and Windows paths", () => {
      assert.strictEqual(baseName(".squad/log/2026-run.md"), "2026-run.md");
      assert.strictEqual(baseName(".squad\\agents\\ghost\\history.md"), "history.md");
    });

    test("Should return the input when there is no separator", () => {
      assert.strictEqual(baseName("team.md"), "team.md");
    });

    test("Should return an empty string for empty input", () => {
      assert.strictEqual(baseName(""), "");
    });
  });

  suite("truncationNotice", () => {
    test("Should return null when the document was not truncated", () => {
      assert.strictEqual(truncationNotice(false, 100), null);
      assert.strictEqual(truncationNotice(undefined, 100), null);
    });

    test("Should describe the size when truncated", () => {
      const notice = truncationNotice(true, 256 * 1024);
      assert.ok(notice);
      assert.ok(notice!.includes("256 KB"));
      assert.ok(notice!.toLowerCase().includes("truncated"));
    });

    test("Should tolerate an unknown size when truncated", () => {
      const notice = truncationNotice(true, undefined);
      assert.ok(notice);
      assert.ok(notice!.includes("unknown size"));
    });
  });
});
