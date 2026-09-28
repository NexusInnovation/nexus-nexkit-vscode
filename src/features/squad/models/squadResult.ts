/**
 * Shared result and error shapes for Squad operations.
 *
 * Design principle (PRD): errors must be visible, actionable, and never
 * collapse into a success state. Every fallible Squad operation returns a
 * {@link SquadResult} discriminated union so callers are forced to handle the
 * failure branch explicitly rather than inspecting a nullable value.
 */

/**
 * Stable, machine-readable error codes for Squad operations.
 * Used for telemetry classification and to drive remediation UI.
 */
export const SQUAD_ERROR_CODES = [
  "detection-failed",
  "cli-not-found",
  "cli-timeout",
  "cli-execution-failed",
  "version-unknown",
  "preset-fetch-failed",
  "preset-invalid",
  "file-read-failed",
  "file-write-failed",
  "write-conflict",
  "parse-failed",
  "doctor-failed",
  "update-check-failed",
  "plugin-list-failed",
  "plugin-action-failed",
  "backup-failed",
  "not-a-workspace",
  "cancelled",
  "unknown",
] as const;

/** Machine-readable Squad error code. */
export type SquadErrorCode = (typeof SQUAD_ERROR_CODES)[number];

/**
 * A structured, actionable Squad error.
 * Never carries user file paths or content into telemetry-facing fields.
 */
export interface SquadError {
  /** Stable classification code. */
  code: SquadErrorCode;

  /** Human-readable, user-facing message describing what went wrong. */
  message: string;

  /**
   * Actionable next step the user can take to resolve the error.
   * Rendered in the UI so failures never appear as a silent success.
   */
  remediation?: string;

  /** Optional non-sensitive technical detail for logging/diagnostics. */
  detail?: string;

  /** Underlying error, when this wraps a caught exception. */
  cause?: unknown;
}

/** Successful outcome carrying a value. */
export interface SquadOk<T> {
  ok: true;
  value: T;
}

/** Failed outcome carrying a structured error. */
export interface SquadFailure {
  ok: false;
  error: SquadError;
}

/**
 * Discriminated union representing the outcome of a fallible Squad operation.
 * Discriminate on the `ok` field before accessing `value` or `error`.
 */
export type SquadResult<T> = SquadOk<T> | SquadFailure;

/** Build a successful {@link SquadResult}. */
export function squadOk<T>(value: T): SquadOk<T> {
  return { ok: true, value };
}

/** Build a failed {@link SquadResult} from a structured error. */
export function squadErr(error: SquadError): SquadFailure {
  return { ok: false, error };
}

/** Type guard narrowing a {@link SquadResult} to its success branch. */
export function isSquadOk<T>(result: SquadResult<T>): result is SquadOk<T> {
  return result.ok === true;
}

/** Type guard narrowing a {@link SquadResult} to its failure branch. */
export function isSquadErr<T>(result: SquadResult<T>): result is SquadFailure {
  return result.ok === false;
}
