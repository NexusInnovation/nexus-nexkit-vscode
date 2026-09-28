/**
 * Pure formatting helpers for the Squad status & diagnostics area (SQD-010).
 *
 * Back the {@link SquadStatusSection} header: project/CLI version classification
 * (FR-002/FR-003), update-available hints (FR-005) and Squad Doctor diagnostics
 * rendering (FR-060/FR-021). Kept Preact- and `vscode`-free so they are safe to
 * import from the webview bundle and unit-testable in the extension-host runner.
 */

import {
  SquadCliInfo,
  SquadCliSource,
  SquadDoctorReport,
  SquadDoctorSeverity,
  SquadVersionStatus,
} from "../../../squad/models";

/**
 * Sentinel project version stamped for a Squad tracked from source rather than
 * pinned to a release (SQD-006). Such versions are not comparable, so they never
 * report an available update.
 */
export const SQUAD_SOURCE_VERSION = "0.0.0-source";

/** How a project version should be presented (FR-002). */
export type ProjectVersionKind = "pinned" | "source" | "unknown";

/** Display model for the project Squad version. */
export interface ProjectVersionDisplay {
  /** Whether the version is pinned, tracked from source, or unknown. */
  kind: ProjectVersionKind;

  /** User-facing label (the version string, or a word for source/unknown). */
  label: string;

  /** True only when a newer version is known to exist (comparable + stale). */
  updateAvailable: boolean;
}

/**
 * Classify a project version as pinned / source / unknown and decide whether an
 * update hint should be shown. Only pinned versions are comparable, so source
 * and unknown never surface an update hint (FR-002).
 */
export function describeProjectVersion(
  version: string | null | undefined,
  status: SquadVersionStatus
): ProjectVersionDisplay {
  const trimmed = typeof version === "string" ? version.trim() : "";
  if (trimmed === "") {
    return { kind: "unknown", label: "unknown", updateAvailable: false };
  }
  if (trimmed.toLowerCase() === SQUAD_SOURCE_VERSION) {
    return { kind: "source", label: "source (local)", updateAvailable: false };
  }
  return {
    kind: "pinned",
    label: trimmed,
    updateAvailable: status === SquadVersionStatus.UpdateAvailable,
  };
}

/** Friendly label for how the CLI is (or would be) invoked (FR-004). */
const CLI_SOURCE_LABEL: Record<SquadCliSource, string> = {
  [SquadCliSource.Global]: "Global install",
  [SquadCliSource.Npx]: "npx",
  [SquadCliSource.Custom]: "Custom path",
};

/** Display model for the Squad CLI availability and version. */
export interface CliVersionDisplay {
  /** Whether a usable CLI was detected. */
  available: boolean;

  /** User-facing label (the version string, `unknown`, or `not detected`). */
  label: string;

  /** How the CLI was resolved, when available; `null` otherwise. */
  sourceLabel: string | null;

  /** True only when a newer CLI version is known to exist. */
  updateAvailable: boolean;
}

/**
 * Classify CLI availability and version. When the CLI is missing this reports a
 * first-class `not detected` state that never collapses into a success (FR-003).
 */
export function describeCliVersion(cli: SquadCliInfo): CliVersionDisplay {
  if (!cli.installed) {
    return { available: false, label: "not detected", sourceLabel: null, updateAvailable: false };
  }
  return {
    available: true,
    label: cli.cliVersion ?? "unknown",
    sourceLabel: cli.source ? CLI_SOURCE_LABEL[cli.source] : null,
    updateAvailable: cli.versionStatus === SquadVersionStatus.UpdateAvailable,
  };
}

/** Short human label for a doctor check severity (FR-060). */
const DOCTOR_SEVERITY_LABEL: Record<SquadDoctorSeverity, string> = {
  [SquadDoctorSeverity.Ok]: "OK",
  [SquadDoctorSeverity.Warning]: "Warning",
  [SquadDoctorSeverity.Error]: "Error",
};

/** Codicon name that visually conveys a doctor check severity. */
const DOCTOR_SEVERITY_CODICON: Record<SquadDoctorSeverity, string> = {
  [SquadDoctorSeverity.Ok]: "pass",
  [SquadDoctorSeverity.Warning]: "warning",
  [SquadDoctorSeverity.Error]: "error",
};

/** Human label for a doctor check severity. */
export function doctorSeverityLabel(severity: SquadDoctorSeverity): string {
  return DOCTOR_SEVERITY_LABEL[severity] ?? "Unknown";
}

/** Codicon name for a doctor check severity. */
export function doctorSeverityCodicon(severity: SquadDoctorSeverity): string {
  return DOCTOR_SEVERITY_CODICON[severity] ?? "circle-outline";
}

/**
 * One-line summary of a Squad Doctor report (FR-060): passing count when clean,
 * otherwise a breakdown of errors and warnings. Empty reports are reported as
 * such rather than as a false "all passed".
 */
export function doctorSummary(report: SquadDoctorReport): string {
  const checks = report.checks ?? [];
  if (checks.length === 0) {
    return "No diagnostics reported";
  }
  const errors = checks.filter((check) => check.severity === SquadDoctorSeverity.Error).length;
  const warnings = checks.filter((check) => check.severity === SquadDoctorSeverity.Warning).length;
  if (errors === 0 && warnings === 0) {
    return checks.length === 1 ? "1 check passed" : `All ${checks.length} checks passed`;
  }
  const parts: string[] = [];
  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}
