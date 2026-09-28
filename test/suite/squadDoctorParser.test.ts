/**
 * Tests for parseSquadDoctorReport (SQD-021, FR-060): structured JSON parsing,
 * text-report fallback, severity aggregation and lenient field handling.
 */

import * as assert from "assert";
import { parseSquadDoctorReport } from "../../src/features/squad/services/squadDoctorParser";
import { SquadDoctorSeverity } from "../../src/features/squad/models";

suite("Unit: parseSquadDoctorReport", () => {
  suite("structured JSON output", () => {
    test("parses an array of checks with mixed severities", () => {
      const json = JSON.stringify([
        { label: "Node", severity: "ok" },
        { name: "CLI", status: "warning", message: "update available", fix: "run upgrade" },
        { title: "Config", level: "error", detail: "missing team.md" },
      ]);

      const report = parseSquadDoctorReport(json, "", 42);

      assert.strictEqual(report.structured, true);
      assert.strictEqual(report.generatedAt, 42);
      assert.strictEqual(report.overall, SquadDoctorSeverity.Error);
      assert.strictEqual(report.checks.length, 3);
      assert.deepStrictEqual(report.checks[1], {
        label: "CLI",
        severity: SquadDoctorSeverity.Warning,
        message: "update available",
        remediation: "run upgrade",
      });
      assert.strictEqual(report.checks[2].label, "Config");
      assert.strictEqual(report.checks[2].severity, SquadDoctorSeverity.Error);
    });

    test("parses a wrapper object with a checks property", () => {
      const json = JSON.stringify({ checks: [{ id: "git", ok: true }] });

      const report = parseSquadDoctorReport(json, "");

      assert.strictEqual(report.structured, true);
      assert.strictEqual(report.overall, SquadDoctorSeverity.Ok);
      assert.strictEqual(report.checks[0].label, "git");
      assert.strictEqual(report.checks[0].severity, SquadDoctorSeverity.Ok);
    });

    test("maps a false boolean flag to an error severity", () => {
      const json = JSON.stringify({ results: [{ name: "markers", passed: false }] });

      const report = parseSquadDoctorReport(json, "");

      assert.strictEqual(report.checks[0].severity, SquadDoctorSeverity.Error);
      assert.strictEqual(report.overall, SquadDoctorSeverity.Error);
    });

    test("extracts JSON embedded in surrounding log noise", () => {
      const output = `starting doctor...\n[{"label":"Node","severity":"ok"}]\nDone.`;

      const report = parseSquadDoctorReport(output, "");

      assert.strictEqual(report.structured, true);
      assert.strictEqual(report.checks.length, 1);
      assert.strictEqual(report.checks[0].severity, SquadDoctorSeverity.Ok);
    });
  });

  suite("text fallback", () => {
    test("classifies lines by glyph markers and aggregates severity", () => {
      const output = ["✓ Node installed", "⚠ CLI outdated", "✗ team.md missing"].join("\n");

      const report = parseSquadDoctorReport(output, "");

      assert.strictEqual(report.structured, false);
      assert.strictEqual(report.checks.length, 3);
      assert.strictEqual(report.overall, SquadDoctorSeverity.Error);
      assert.strictEqual(report.checks[0].label, "Node installed");
      assert.strictEqual(report.checks[0].severity, SquadDoctorSeverity.Ok);
      assert.strictEqual(report.checks[1].severity, SquadDoctorSeverity.Warning);
      assert.strictEqual(report.checks[2].label, "team.md missing");
    });

    test("classifies lines by bracketed keyword markers", () => {
      const output = ["[ok] Node", "[FAIL] Config"].join("\n");

      const report = parseSquadDoctorReport(output, "");

      assert.strictEqual(report.structured, false);
      assert.strictEqual(report.checks[0].severity, SquadDoctorSeverity.Ok);
      assert.strictEqual(report.checks[1].severity, SquadDoctorSeverity.Error);
      assert.strictEqual(report.checks[1].label, "Config");
    });

    test("summarises unrecognised output as a single ok check", () => {
      const report = parseSquadDoctorReport("Everything looks good.", "", 7);

      assert.strictEqual(report.structured, false);
      assert.strictEqual(report.overall, SquadDoctorSeverity.Ok);
      assert.strictEqual(report.checks.length, 1);
      assert.strictEqual(report.checks[0].message, "Everything looks good.");
      assert.strictEqual(report.generatedAt, 7);
    });

    test("falls back to stderr when stdout is empty", () => {
      const report = parseSquadDoctorReport("", "✗ broken", 0);

      assert.strictEqual(report.structured, false);
      assert.strictEqual(report.overall, SquadDoctorSeverity.Error);
      assert.strictEqual(report.checks[0].label, "broken");
    });

    test("handles completely empty output without throwing", () => {
      const report = parseSquadDoctorReport("", "", 0);

      assert.strictEqual(report.structured, false);
      assert.strictEqual(report.overall, SquadDoctorSeverity.Ok);
      assert.strictEqual(report.checks.length, 1);
    });
  });
});
