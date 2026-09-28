/**
 * Domain types describing whether Squad is present in a workspace and, if so,
 * which versions are installed.
 *
 * Covers PRD FR-001 (marker detection), FR-002 (project version from the
 * `<!-- version: x -->` comment, `unknown` when absent) and FR-003 (CLI
 * detection via a non-interactive `squad version` call with a timeout).
 */

/**
 * Known files that signal the presence of Squad in a workspace (FR-001).
 * Paths are workspace-root-relative and joined with `vscode.Uri.joinPath`
 * by consumers — never string-concatenated.
 */
export const SQUAD_MARKER_FILES = [
  ".squad/config.json",
  ".squad/team.md",
  ".github/agents/squad.agent.md",
] as const;

/** A workspace-root-relative Squad marker path. */
export type SquadMarkerFile = (typeof SQUAD_MARKER_FILES)[number];

/**
 * Whether Squad was found in the workspace.
 * `partial` means some but not all markers are present.
 */
export const SquadInstallState = {
  NotInstalled: "not-installed",
  Partial: "partial",
  Installed: "installed",
} as const;

export type SquadInstallState = (typeof SquadInstallState)[keyof typeof SquadInstallState];

/**
 * Freshness of a version relative to the latest known version.
 * `unknown` is a first-class state (FR-002) — never coerced to a success.
 */
export const SquadVersionStatus = {
  Unknown: "unknown",
  UpToDate: "up-to-date",
  UpdateAvailable: "update-available",
} as const;

export type SquadVersionStatus = (typeof SquadVersionStatus)[keyof typeof SquadVersionStatus];

/** How the Squad CLI is (or would be) invoked (FR-004). */
export const SquadCliSource = {
  /** Installed globally via `npm install -g @bradygaster/squad-cli`. */
  Global: "global",
  /** Invoked on demand via `npx @bradygaster/squad-cli`. */
  Npx: "npx",
  /** A user-configured custom executable path. */
  Custom: "custom",
} as const;

export type SquadCliSource = (typeof SquadCliSource)[keyof typeof SquadCliSource];

/** Presence of each individual Squad marker file (FR-001). */
export type SquadMarkerPresence = Record<SquadMarkerFile, boolean>;

/**
 * Squad state read from the project itself (FR-001, FR-002).
 * Populated from workspace files only — no CLI execution.
 */
export interface SquadProjectInfo {
  /** Aggregate install state derived from marker presence. */
  installState: SquadInstallState;

  /** Presence flag for each known marker file. */
  markers: SquadMarkerPresence;

  /**
   * Project Squad version parsed from the `<!-- version: x -->` comment in
   * `.github/agents/squad.agent.md`, or `null` when absent/unparseable.
   */
  projectVersion: string | null;

  /** Freshness of {@link projectVersion} against the latest known version. */
  versionStatus: SquadVersionStatus;
}

/**
 * Squad CLI availability, resolved by a non-interactive, timed-out
 * `squad version` / `squad --version` call (FR-003).
 */
export interface SquadCliInfo {
  /** Whether a usable CLI was found. */
  installed: boolean;

  /** How the CLI was resolved, when installed. */
  source?: SquadCliSource;

  /** Parsed CLI version string, or `null` when unknown. */
  cliVersion: string | null;

  /** Freshness of {@link cliVersion} against the latest published version. */
  versionStatus: SquadVersionStatus;
}

/**
 * Combined detection snapshot for the Squad panel status area (FR-021).
 * Loaded on panel open / on demand — never during extension activation.
 */
export interface SquadDetectionResult {
  /** Project-side detection (files, versions). */
  project: SquadProjectInfo;

  /** CLI-side detection (availability, version). */
  cli: SquadCliInfo;

  /** Epoch milliseconds when this snapshot was produced. */
  detectedAt: number;
}
