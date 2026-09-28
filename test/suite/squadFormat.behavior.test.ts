/**
 * Behaviour coverage for the pure Squad view formatting helpers (SQD-024).
 *
 * Complements the baseline `squadFormat.test.ts` (SQD-012/013/014) with the
 * boundary and rounding cases that back the read-only Squad panel views: the
 * larger size units (GB/TB), the >=10 / integer rounding branches, non-finite
 * inputs, and path edge cases (trailing/leading separators, dotfiles, mixed
 * separators). These helpers are Preact-free and run in the extension-host
 * Mocha runner without any DOM.
 */

import * as assert from "assert";
import { baseName, formatBytes, truncationNotice } from "../../src/features/panel-ui/webview/utils/squadFormat";

suite("Behaviour: Squad Format Helpers (SQD-024)", () => {
  suite("formatBytes — unit boundaries", () => {
    test("Should keep the largest sub-KB value in bytes", () => {
      assert.strictEqual(formatBytes(1023), "1023 B");
    });

    test("Should switch to KB exactly at 1024 bytes", () => {
      assert.strictEqual(formatBytes(1024), "1 KB");
    });

    test("Should render whole megabytes and gigabytes", () => {
      assert.strictEqual(formatBytes(1024 * 1024), "1 MB");
      assert.strictEqual(formatBytes(1024 * 1024 * 1024), "1 GB");
    });

    test("Should render terabytes and clamp at the largest known unit", () => {
      assert.strictEqual(formatBytes(1024 ** 4), "1 TB");
      // Beyond TB there is no larger unit, so the value stays expressed in TB.
      assert.strictEqual(formatBytes(1024 ** 5), "1024 TB");
    });
  });

  suite("formatBytes — rounding branches", () => {
    test("Should round to a whole number once the value reaches 10", () => {
      assert.strictEqual(formatBytes(10 * 1024), "10 KB");
      assert.strictEqual(formatBytes(11 * 1024), "11 KB");
    });

    test("Should render whole-number values without a decimal", () => {
      assert.strictEqual(formatBytes(2 * 1024), "2 KB");
      assert.strictEqual(formatBytes(256 * 1024), "256 KB");
    });

    test("Should keep a single decimal for small non-integer values", () => {
      assert.strictEqual(formatBytes(1536), "1.5 KB");
      assert.strictEqual(formatBytes(2560), "2.5 KB");
    });
  });

  suite("formatBytes — invalid and non-finite input", () => {
    test("Should treat zero as a valid byte count", () => {
      assert.strictEqual(formatBytes(0), "0 B");
    });

    test("Should reject negative counts", () => {
      assert.strictEqual(formatBytes(-1), "unknown size");
      assert.strictEqual(formatBytes(-1024), "unknown size");
    });

    test("Should reject non-finite counts", () => {
      assert.strictEqual(formatBytes(Number.NaN), "unknown size");
      assert.strictEqual(formatBytes(Number.POSITIVE_INFINITY), "unknown size");
      assert.strictEqual(formatBytes(Number.NEGATIVE_INFINITY), "unknown size");
    });

    test("Should reject missing counts", () => {
      assert.strictEqual(formatBytes(undefined), "unknown size");
      assert.strictEqual(formatBytes(null), "unknown size");
    });
  });

  suite("baseName — path edge cases", () => {
    test("Should drop a leading separator", () => {
      assert.strictEqual(baseName("/a/b.md"), "b.md");
    });

    test("Should ignore a trailing separator", () => {
      assert.strictEqual(baseName(".squad/log/"), "log");
      assert.strictEqual(baseName(".squad\\agents\\ghost\\"), "ghost");
    });

    test("Should normalise mixed POSIX and Windows separators", () => {
      assert.strictEqual(baseName("a\\b/c.md"), "c.md");
    });

    test("Should return the raw input when it is only separators", () => {
      assert.strictEqual(baseName("///"), "///");
    });

    test("Should return a dotfile name unchanged when it has no separator", () => {
      assert.strictEqual(baseName(".gitignore"), ".gitignore");
    });

    test("Should return an empty string for empty input", () => {
      assert.strictEqual(baseName(""), "");
    });
  });

  suite("truncationNotice — completeness", () => {
    test("Should return null when not truncated", () => {
      assert.strictEqual(truncationNotice(false, 4096), null);
      assert.strictEqual(truncationNotice(undefined, 4096), null);
    });

    test("Should include the formatted size, a truncation phrase and open-file guidance", () => {
      const notice = truncationNotice(true, 5000);
      assert.ok(notice, "expected a notice string");
      assert.ok(notice!.includes(formatBytes(5000)), "notice should embed the human-readable size");
      assert.ok(notice!.toLowerCase().includes("truncated for display"));
      assert.ok(notice!.includes("Open the file directly"));
    });

    test("Should still render guidance when the size is zero or unknown", () => {
      const zero = truncationNotice(true, 0);
      assert.ok(zero!.includes("0 B"));
      const unknown = truncationNotice(true, undefined);
      assert.ok(unknown!.includes("unknown size"));
    });
  });
});
