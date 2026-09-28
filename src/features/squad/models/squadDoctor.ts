/**
 * Domain types for Squad Doctor diagnostics.
 *
 * Covers PRD FR-060: surface Squad Doctor results as structured data when
 * available, otherwise from a minimally parsed text report. The `structured`
 * flag records which path produced the report so the UI can set expectations.
 */

/** Severity of an individual doctor check outcome. */
export const SquadDoctorSeverity = {
  Ok: "ok",
  Warning: "warning",
  Error: "error",
} as const;

export type SquadDoctorSeverity = (typeof SquadDoctorSeverity)[keyof typeof SquadDoctorSeverity];

/** A single diagnostic check reported by Squad Doctor. */
export interface SquadDoctorCheck {
  /** Short check identifier or title. */
  label: string;

  /** Outcome severity of the check. */
  severity: SquadDoctorSeverity;

  /** Human-readable detail about the check result. */
  message?: string;

  /** Actionable remediation when the check is not `ok`. */
  remediation?: string;
}

/**
 * Aggregated Squad Doctor report (FR-060).
 * `structured` is true when parsed from machine-readable output, false when
 * derived from a minimal text-report fallback.
 */
export interface SquadDoctorReport {
  /** Highest severity across all checks. */
  overall: SquadDoctorSeverity;

  /** Individual check results. */
  checks: SquadDoctorCheck[];

  /** Whether the report came from structured output vs. text parsing. */
  structured: boolean;

  /** Epoch milliseconds when the report was produced. */
  generatedAt: number;
}
