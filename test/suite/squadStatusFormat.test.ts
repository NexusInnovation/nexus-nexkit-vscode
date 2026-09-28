/**
 * Tests for the pure Squad status & diagnostics formatting helpers (SQD-010).
 *
 * These helpers back the Squad status header (project/CLI versions, update
 * hints) and the Squad Doctor diagnostics list. They are Preact-free and safe
 * to unit test in the extension-host runner.
 */

import * as assert from "assert";
import {
  CliVersionDisplay,
  describeCliVersion,
  describeProjectVersion,
  doctorSeverityCodicon,
  doctorSeverityLabel,
  doctorSummary,
  SQUAD_SOURCE_VERSION,
} from "../../src/features/panel-ui/webview/utils/squadStatusFormat";
import {
  SquadCliInfo,
  SquadCliSource,
  SquadDoctorReport,
  SquadDoctorSeverity,
  SquadVersionStatus,
} from "../../src/features/squad/models";

function cli(overrides: Partial<SquadCliInfo>): SquadCliInfo {
  return {
    installed: true,
    cliVersion: "1.0.0",
    versionStatus: SquadVersionStatus.UpToDate,
    ...overrides,
  };
}

function report(overrides: Partial<SquadDoctorReport>): SquadDoctorReport {
  return {
    overall: SquadDoctorSeverity.Ok,
    checks: [],
    structured: true,
    generatedAt: 0,
    ...overrides,
  };
}

suite("Unit: Squad Status Format Helpers", () => {
  suite("describeProjectVersion", () => {
    test("Should classify a pinned semver version", () => {
      const display = describeProjectVersion("1.2.3", SquadVersionStatus.UpToDate);
      assert.strictEqual(display.kind, "pinned");
      assert.strictEqual(display.label, "1.2.3");
      assert.strictEqual(display.updateAvailable, false);
    });

    test("Should flag an available update only for a pinned version", () => {
      const display = describeProjectVersion("1.2.3", SquadVersionStatus.UpdateAvailable);
      assert.strictEqual(display.kind, "pinned");
      assert.strictEqual(display.updateAvailable, true);
    });

    test("Should classify the source sentinel and never offer an update", () => {
      const display = describeProjectVersion(SQUAD_SOURCE_VERSION, SquadVersionStatus.UpdateAvailable);
      assert.strictEqual(display.kind, "source");
      assert.ok(display.label.toLowerCase().includes("source"));
      assert.strictEqual(display.updateAvailable, false);
    });

    test("Should treat null / empty as unknown and never offer an update", () => {
      for (const value of [null, undefined, "", "   "]) {
        const display = describeProjectVersion(value as string | null, SquadVersionStatus.UpdateAvailable);
        assert.strictEqual(display.kind, "unknown");
        assert.strictEqual(display.label, "unknown");
        assert.strictEqual(display.updateAvailable, false);
      }
    });
  });

  suite("describeCliVersion", () => {
    test("Should report a first-class not-detected state when missing", () => {
      const display: CliVersionDisplay = describeCliVersion(cli({ installed: false, cliVersion: null }));
      assert.strictEqual(display.available, false);
      assert.strictEqual(display.label, "not detected");
      assert.strictEqual(display.sourceLabel, null);
      assert.strictEqual(display.updateAvailable, false);
    });

    test("Should render the version and source label when installed", () => {
      const display = describeCliVersion(cli({ source: SquadCliSource.Npx, cliVersion: "2.1.0" }));
      assert.strictEqual(display.available, true);
      assert.strictEqual(display.label, "2.1.0");
      assert.strictEqual(display.sourceLabel, "npx");
    });

    test("Should fall back to unknown when installed without a version", () => {
      const display = describeCliVersion(cli({ cliVersion: null, source: SquadCliSource.Global }));
      assert.strictEqual(display.label, "unknown");
      assert.strictEqual(display.sourceLabel, "Global install");
    });

    test("Should flag an available CLI update", () => {
      const display = describeCliVersion(
        cli({ source: SquadCliSource.Custom, versionStatus: SquadVersionStatus.UpdateAvailable })
      );
      assert.strictEqual(display.updateAvailable, true);
      assert.strictEqual(display.sourceLabel, "Custom path");
    });
  });

  suite("doctor severity helpers", () => {
    test("Should map severities to labels", () => {
      assert.strictEqual(doctorSeverityLabel(SquadDoctorSeverity.Ok), "OK");
      assert.strictEqual(doctorSeverityLabel(SquadDoctorSeverity.Warning), "Warning");
      assert.strictEqual(doctorSeverityLabel(SquadDoctorSeverity.Error), "Error");
    });

    test("Should map severities to codicons", () => {
      assert.strictEqual(doctorSeverityCodicon(SquadDoctorSeverity.Ok), "pass");
      assert.strictEqual(doctorSeverityCodicon(SquadDoctorSeverity.Warning), "warning");
      assert.strictEqual(doctorSeverityCodicon(SquadDoctorSeverity.Error), "error");
    });
  });

  suite("doctorSummary", () => {
    test("Should report no diagnostics for an empty report", () => {
      assert.strictEqual(doctorSummary(report({ checks: [] })), "No diagnostics reported");
    });

    test("Should report all-passed when every check is ok", () => {
      const summary = doctorSummary(
        report({
          checks: [
            { label: "a", severity: SquadDoctorSeverity.Ok },
            { label: "b", severity: SquadDoctorSeverity.Ok },
          ],
        })
      );
      assert.strictEqual(summary, "All 2 checks passed");
    });

    test("Should break down errors and warnings with correct pluralisation", () => {
      const summary = doctorSummary(
        report({
          checks: [
            { label: "a", severity: SquadDoctorSeverity.Error },
            { label: "b", severity: SquadDoctorSeverity.Warning },
            { label: "c", severity: SquadDoctorSeverity.Warning },
            { label: "d", severity: SquadDoctorSeverity.Ok },
          ],
        })
      );
      assert.strictEqual(summary, "1 error, 2 warnings");
    });
  });
});
