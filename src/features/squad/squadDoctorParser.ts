/**
 * Parser for Squad Doctor CLI output (SQD-021, PRD FR-060).
 *
 * Turns the raw stdout/stderr of `squad doctor` into a structured
 * {@link SquadDoctorReport}. Two input shapes are supported:
 *
 * - **Structured** (`squad doctor --json`): a JSON document describing the
 *   individual checks. Parsed leniently since the CLI's exact field names are
 *   not contractually fixed — several common aliases are accepted.
 * - **Text fallback**: a human-readable report whose lines are scanned for
 *   severity markers (glyphs such as `✓`/`✗`/`⚠` or `[ok]`/`FAIL`/`WARN`
 *   keywords). Used whenever the output is not valid JSON.
 *
 * The parser never throws: unparseable output degrades to a single summary
 * check so the UI always has something actionable to display, and the
 * {@link SquadDoctorReport.structured} flag records which path produced it.
 */

import {
  SquadDoctorCheck,
  SquadDoctorReport,
  SquadDoctorSeverity,
} from "./models";

/** Severity ordering used to compute the overall report severity. */
const SEVERITY_RANK: Record<SquadDoctorSeverity, number> = {
  [SquadDoctorSeverity.Ok]: 0,
  [SquadDoctorSeverity.Warning]: 1,
  [SquadDoctorSeverity.Error]: 2,
};

/** Leading text markers that classify a text-report line by severity. */
const TEXT_SEVERITY_MARKERS: ReadonlyArray<{ pattern: RegExp; severity: SquadDoctorSeverity }> = [
  { pattern: /^(?:[✗✘×✕❌]|\[\s*(?:x|fail|failed|error)\s*\]|(?:fail|failed|error)\b)/i, severity: SquadDoctorSeverity.Error },
  { pattern: /^(?:[⚠!]|\[\s*(?:warn|warning)\s*\]|(?:warn|warning)\b)/i, severity: SquadDoctorSeverity.Warning },
  { pattern: /^(?:[✓✔☑]|\[\s*(?:ok|pass|passed)\s*\]|(?:ok|pass|passed)\b)/i, severity: SquadDoctorSeverity.Ok },
];

/**
 * Parse Squad Doctor output into a {@link SquadDoctorReport}.
 *
 * @param stdout Captured standard output of the doctor command.
 * @param stderr Captured standard error (used only for the text fallback).
 * @param now Epoch-millisecond clock for {@link SquadDoctorReport.generatedAt}.
 */
export function parseSquadDoctorReport(
  stdout: string,
  stderr: string,
  now: number = Date.now()
): SquadDoctorReport {
  const structured = tryParseStructured(stdout, now);
  if (structured) {
    return structured;
  }
  return parseTextReport(stdout, stderr, now);
}

/** Attempt to parse structured JSON doctor output; returns null on any miss. */
function tryParseStructured(stdout: string, now: number): SquadDoctorReport | null {
  const json = extractJson(stdout);
  if (json === undefined) {
    return null;
  }

  const rawChecks = extractCheckArray(json);
  if (!rawChecks) {
    return null;
  }

  const checks = rawChecks
    .map((raw) => toCheck(raw))
    .filter((check): check is SquadDoctorCheck => check !== null);

  if (checks.length === 0) {
    return null;
  }

  return {
    overall: computeOverall(checks),
    checks,
    structured: true,
    generatedAt: now,
  };
}

/** Parse the first JSON value from output, tolerating leading/trailing noise. */
function extractJson(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to a bounded object/array slice below.
  }

  const start = trimmed.search(/[[{]/);
  if (start === -1) {
    return undefined;
  }
  const open = trimmed[start];
  const close = open === "[" ? "]" : "}";
  const end = trimmed.lastIndexOf(close);
  if (end <= start) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** Locate the array of check objects within a parsed JSON value. */
function extractCheckArray(json: unknown): unknown[] | null {
  if (Array.isArray(json)) {
    return json;
  }
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    for (const key of ["checks", "results", "diagnostics", "items"]) {
      if (Array.isArray(record[key])) {
        return record[key] as unknown[];
      }
    }
  }
  return null;
}

/** Convert a single raw JSON check into a {@link SquadDoctorCheck}. */
function toCheck(raw: unknown): SquadDoctorCheck | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;

  const label =
    firstString(record, ["label", "name", "title", "id", "check"]) ?? "Check";
  const message = firstString(record, ["message", "detail", "description", "info"]);
  const remediation = firstString(record, ["remediation", "fix", "hint", "suggestion", "action"]);
  const severity = resolveSeverity(record);

  const check: SquadDoctorCheck = { label, severity };
  if (message) {
    check.message = message;
  }
  if (remediation) {
    check.remediation = remediation;
  }
  return check;
}

/** Resolve a check's severity from a variety of common field encodings. */
function resolveSeverity(record: Record<string, unknown>): SquadDoctorSeverity {
  const token = firstString(record, ["severity", "status", "level", "state", "result", "outcome"]);
  if (token) {
    const normalized = normalizeSeverityToken(token);
    if (normalized) {
      return normalized;
    }
  }

  for (const key of ["ok", "passed", "success", "healthy"]) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value ? SquadDoctorSeverity.Ok : SquadDoctorSeverity.Error;
    }
  }

  return SquadDoctorSeverity.Warning;
}

/** Map a severity/status token to a {@link SquadDoctorSeverity}, or null. */
function normalizeSeverityToken(token: string): SquadDoctorSeverity | null {
  const value = token.trim().toLowerCase();
  if (["ok", "pass", "passed", "success", "healthy", "info"].includes(value)) {
    return SquadDoctorSeverity.Ok;
  }
  if (["warn", "warning"].includes(value)) {
    return SquadDoctorSeverity.Warning;
  }
  if (["error", "fail", "failed", "critical", "fatal"].includes(value)) {
    return SquadDoctorSeverity.Error;
  }
  return null;
}

/** Return the first non-empty string among the given keys of a record. */
function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

/** Parse a human-readable text doctor report line by line. */
function parseTextReport(stdout: string, stderr: string, now: number): SquadDoctorReport {
  const source = stdout.trim() ? stdout : stderr;
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const checks: SquadDoctorCheck[] = [];
  for (const line of lines) {
    const match = TEXT_SEVERITY_MARKERS.find((marker) => marker.pattern.test(line));
    if (!match) {
      continue;
    }
    const label = stripLeadingMarker(line);
    checks.push({ label: label || line, severity: match.severity });
  }

  if (checks.length === 0) {
    // Doctor ran but produced no recognisable per-check markers; summarise the
    // raw output so the panel still shows an actionable result.
    const summary = lines[0] ?? "Squad Doctor completed with no reported issues.";
    return {
      overall: SquadDoctorSeverity.Ok,
      checks: [{ label: "Squad Doctor", severity: SquadDoctorSeverity.Ok, message: summary }],
      structured: false,
      generatedAt: now,
    };
  }

  return {
    overall: computeOverall(checks),
    checks,
    structured: false,
    generatedAt: now,
  };
}

/** Strip a leading severity glyph, bracketed tag or keyword from a line. */
function stripLeadingMarker(line: string): string {
  return line
    .replace(/^[✗✘×✕❌⚠✓✔☑!]+\s*/u, "")
    .replace(/^\[\s*(?:x|fail|failed|error|warn|warning|ok|pass|passed)\s*\]\s*/i, "")
    .replace(/^(?:fail|failed|error|warn|warning|ok|pass|passed)\b[:.\-\s]*/i, "")
    .trim();
}

/** Compute the highest severity across all checks (defaults to ok). */
function computeOverall(checks: SquadDoctorCheck[]): SquadDoctorSeverity {
  let overall: SquadDoctorSeverity = SquadDoctorSeverity.Ok;
  for (const check of checks) {
    if (SEVERITY_RANK[check.severity] > SEVERITY_RANK[overall]) {
      overall = check.severity;
    }
  }
  return overall;
}
