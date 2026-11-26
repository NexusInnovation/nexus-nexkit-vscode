import * as assert from "assert";
import { looksLikeError, parseLogLine } from "../../src/features/devops-pipelines/buildLogParser";

suite("Unit: buildLogParser", () => {
  test("classifies plain lines that read like failures as errors", () => {
    const failures = [
      "fatal: could not read Username for 'https://dev.azure.com'",
      "Process completed with exit code 1.",
      "error TS2304: Cannot find name 'foo'.",
      "Build FAILED.",
      "The operation was aborted",
      "Unhandled exception. System.InvalidOperationException",
      "Process completed with exit code -1.",
      "Build FAILED. 0 errors.",
      "0 errors; process completed with exit code 1.",
    ];
    for (const text of failures) {
      assert.strictEqual(parseLogLine(`2025-01-01T10:20:30.123Z ${text}`)?.kind, "error", text);
    }
  });

  test("leaves successful or neutral lines uncolored", () => {
    const neutral = [
      "Process completed with exit code 0.",
      "Build succeeded. 0 Warning(s) 0 Error(s)",
      "Found no errors",
      "Restoring packages",
      "failOnStderr: false",
    ];
    for (const text of neutral) {
      assert.strictEqual(looksLikeError(text), false, text);
    }
  });

  test("keeps the color of directive lines", () => {
    assert.strictEqual(parseLogLine("##[warning]fail-safe enabled")?.kind, "warning");
    assert.strictEqual(parseLogLine("##[command]git fetch --fail-fast")?.kind, "command");
    assert.strictEqual(parseLogLine("##[error]boom")?.kind, "error");
  });
});
