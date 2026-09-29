/**
 * Squad slice of the webview {@link AppState} (SQD-007).
 *
 * Models everything the Squad tab (#224) will render: detection status and
 * versions, roster and charters, editable governance docs, read-only logs,
 * upstreams/plugins, doctor diagnostics, plus loading and error states. Covers
 * PRD FR-020, FR-021, FR-022 (and prepares FR-023..FR-025,
 * FR-060) while reusing the SQD-001 domain types.
 *
 * All types are serialisable and imported type-only from `../../../squad/models`
 * so the Preact webview bundle never pulls in extension-host code. Errors are
 * surfaced through {@link SquadState.error} as a structured, actionable
 * {@link SquadError} and never collapse into a success state.
 */

import type {
  RejectedSquadPreset,
  SquadBacklogDetection,
  SquadCharter,
  SquadCliUpgradeSummary,
  SquadDetectionResult,
  SquadDocKind,
  SquadDoctorReport,
  SquadError,
  SquadErrorCode,
  SquadImportOutcome,
  SquadImportPreview,
  SquadMarkdownDoc,
  SquadMarketplaceRef,
  SquadModelConfigDocument,
  SquadPluginAction,
  SquadPreset,
  SquadPluginRef,
  SquadRosterMember,
  SquadUpstreamRecommendations,
  SquadUpdatesResult,
  SquadUpstreamSource,
  SquadUpstreamOperation,
  UnreachableSquadSource,
} from "../../../squad/models";
import type { SquadWriteSummary } from "../../types/webviewMessages";

/**
 * A Squad file the panel can edit (SQD-029, FR-023/FR-024): an agent charter
 * or a governance document (decisions/routing).
 */
export type SquadEditTarget = { type: "charter"; agentId: string } | { type: "doc"; kind: SquadDocKind };

/**
 * Outcome of the most recent controlled Squad write (SQD-029).
 *
 * `sequence` increases monotonically with every write outcome so an editor
 * can tell whether a result arrived after it issued its own save. Failures
 * carry no target because the host reports them through the shared
 * `squadError` message.
 */
export type SquadWriteOutcome =
  | { sequence: number; ok: true; target: SquadEditTarget; summary: SquadWriteSummary }
  | { sequence: number; ok: false; error: SquadError };

/**
 * Error codes the controlled write path (SQD-026/SQD-027) can emit. Only
 * these `squadError` codes are recorded as a write failure; any other error
 * (e.g. detection) never resolves a pending save.
 */
export const SQUAD_WRITE_ERROR_CODES: readonly SquadErrorCode[] = [
  "backup-failed",
  "file-write-failed",
  "write-conflict",
  "not-a-workspace",
];

/**
 * Kind of a read-only Squad log document (FR-025).
 * SQD-001 does not model logs, so this webview-facing descriptor is defined
 * here; it stays serialisable and free of extension-host dependencies.
 */
export const SquadLogKind = {
  /** An agent history file (`.squad/agents/<id>/history.md`). */
  AgentHistory: "agent-history",
  /** A generic Squad log. */
  Log: "log",
  /** An orchestration log. */
  Orchestration: "orchestration",
} as const;

export type SquadLogKind = (typeof SquadLogKind)[keyof typeof SquadLogKind];

/**
 * A read-only Squad log document surfaced in the panel (FR-025).
 * Holds raw content for display only — editing is out of scope for the MVP.
 */
export interface SquadLogDocument {
  /** Discriminates agent history / log / orchestration. */
  kind: SquadLogKind;

  /** Owning agent identifier, when {@link kind} is `agent-history`. */
  agentId?: string;

  /** Workspace-root-relative path to the log file. */
  relativePath: string;

  /** Raw text content of the log (truncated to the read cap when large). */
  content: string;

  /**
   * True when {@link content} was truncated to the read cap. The viewer shows
   * a size notice and an "open full file" affordance when set (FR-025).
   */
  truncated?: boolean;

  /** Total size of the file on disk in bytes, when known. */
  sizeBytes?: number;
}

/**
 * Preset selection screen sub-state (SQD-019 / #234, FR-010/FR-014/FR-015).
 *
 * Drives the "Squad not detected" preset picker: the presets discovered from
 * every source, per-preset validation rejections and per-source unreachable
 * errors, plus loading and hard-failure states. Populated exclusively through
 * the `squadPresets*` messages handled in `AppStateContext`.
 */
export interface SquadPresetPickerState {
  /** True while a preset discovery is in flight. */
  loading: boolean;

  /** True once a discovery response (success or failure) has been received. */
  loaded: boolean;

  /** Valid, contract-passing presets ready to offer (FR-010). */
  presets: SquadPreset[];

  /**
   * Presets that were found but failed the SQD-015 contract, with actionable
   * diagnostics. Rendered as disabled entries so they are visible, never hidden.
   */
  rejected: RejectedSquadPreset[];

  /**
   * Sources that could not be reached or read (e.g. a private external repo or
   * a failing child provider). Surfaced per-source so one failure never hides
   * the healthy presets.
   */
  unreachable: UnreachableSquadSource[];

  /**
   * Source-level hard failure (whole discovery could not run), or `null` when
   * healthy. Always visible and actionable.
   */
  error: SquadError | null;

  /**
   * Result of the most recent "initialise from preset" request (FR-014). The
   * actual initialisation ships in #235; until then the host replies with a
   * clear "not available yet" error surfaced in the confirmation panel.
   */
  initError: SquadError | null;

  /** Preset id the {@link initError} (or last init result) applies to. */
  initResultPresetId: string | null;
}

/** Initial preset picker state — empty and not yet loaded. */
export const initialSquadPresetPickerState: SquadPresetPickerState = {
  loading: false,
  loaded: false,
  presets: [],
  rejected: [],
  unreachable: [],
  error: null,
  initError: null,
  initResultPresetId: null,
};

/**
 * Outcome of the most recent plugin marketplace / lifecycle action (SQD-039,
 * FR-040/FR-041/FR-044). ok: false always carries an actionable error.
 */
export interface SquadPluginActionResultState {
  /** The action that ran. */
  action: SquadPluginAction;

  /** Resolved operand, when any. */
  target?: string;

  /** Whether the action succeeded. */
  ok: boolean;

  /** Whether the Squad state changed (false for validate/dry-run or no-ops). */
  changed?: boolean;

  /** CLI output (e.g. validation messages or the dry-run plan). */
  output?: string;

  /** Actionable error when {@link ok} is false. */
  error?: SquadError;
}

/** Backlog status sub-state (SQD-044, FR-050/FR-051/FR-052/FR-053). */
export interface SquadBacklogState {
  /** True while GitHub Issues / Azure DevOps backlog detection is running. */
  isLoading: boolean;

  /** True after the first backlog detection response, success or failure. */
  isReady: boolean;

  /** Detected or not-detected backlog outcome, or `null` before the first response / after a hard error. */
  detection: SquadBacklogDetection | null;

  /** Actionable backlog detection failure; never rendered as a successful state. */
  error: SquadError | null;
}

/** Initial backlog state — empty until SQD-042/043 detection responds. */
export const initialSquadBacklogState: SquadBacklogState = {
  isLoading: false,
  isReady: false,
  detection: null,
  error: null,
};

/**
 * Squad state slice held in the global {@link AppState}.
 * A single source of truth for the Squad tab; populated exclusively through
 * messages handled in `AppStateContext` (never per-component listeners).
 */
export interface SquadState {
  /** Whether the first Squad status snapshot has been received (FR-021). */
  isReady: boolean;

  /** True while a Squad detection/refresh is in flight. */
  isLoading: boolean;

  /**
   * Last structured error, or `null` when healthy. Rendered as visible,
   * actionable UI so failures never appear as a silent success.
   */
  error: SquadError | null;

  /**
   * Detection snapshot: install state, project version, CLI version and
   * freshness (FR-021). `null` until the first snapshot arrives.
   */
  detection: SquadDetectionResult | null;

  /** Team roster read from `.squad/team.md` (FR-022). */
  roster: SquadRosterMember[];

  /** Agent charters read from `.squad/agents/<id>/charter.md` (FR-022). */
  charters: SquadCharter[];

  /** Editable `.squad/decisions.md` document (FR-024), when present. */
  decisions: SquadMarkdownDoc | null;

  /** Editable `.squad/routing.md` document (FR-024), when present. */
  routing: SquadMarkdownDoc | null;

  /**
   * Editable `.squad/model-config.json` document (FR-063). `null` until read;
   * `exists: false` when absent; `config: null` when the file is invalid (a
   * `squadError` is emitted alongside).
   */
  modelConfig: SquadModelConfigDocument | null;

  /** Read-only agent histories, logs and orchestration logs (FR-025). */
  logs: SquadLogDocument[];

  /** Upstream inheritance sources shown in the status area (FR-021). */
  upstreams: SquadUpstreamSource[];

  /**
   * Org → team → project recommendations and upstream warnings (SQD-037,
   * FR-033/034/035). `null` until evaluated or when the upstream manifest
   * could not be read.
   */
  upstreamRecommendations: SquadUpstreamRecommendations | null;

  /** Plugin marketplaces read from `.squad/plugins/marketplaces.json` (FR-042). */
  marketplaces: SquadMarketplaceRef[];

  /** Installed plugins shown in the status area (FR-021). */
  plugins: SquadPluginRef[];

  /** Result of the most recent plugin action (SQD-039), or `null` before any. */
  lastPluginAction: SquadPluginActionResultState | null;

  /** GitHub Issues / Azure DevOps backlog status (SQD-044). */
  backlog: SquadBacklogState;

  /** Latest Squad Doctor report (FR-060), when one has been produced. */
  doctor: SquadDoctorReport | null;

  /** Latest Squad CLI/project update-check result (FR-005), when requested. */
  updates: SquadUpdatesResult | null;

  /** Latest confirmed CLI self-upgrade result (SQD-031, FR-005); failures go to {@link error}. */
  cliUpgrade: SquadCliUpgradeSummary | null;

  /** Latest previewed Squad import, or `null` when no preview is staged. */
  importPreview: SquadImportPreview | null;

  /** Latest successful Squad import outcome, or `null` before an import completes. */
  lastImport: SquadImportOutcome | null;

  /** Preset selection screen sub-state (SQD-019, FR-010/FR-014/FR-015). */
  presetPicker: SquadPresetPickerState;

  /**
   * Latest upstream add/sync/remove/list operation (SQD-036, FR-031/FR-032),
   * or `null` before the first one. Failures carry an actionable error.
   */
  upstreamOperation: SquadUpstreamOperationState | null;

  /**
   * Latest charter/decisions/routing write outcome (SQD-029), or `null` before
   * any save. Drives the editors' success/backup notice and inline errors.
   */
  lastWrite: SquadWriteOutcome | null;
}

/** Progress / outcome of the latest `squad upstream` operation (SQD-036). */
export interface SquadUpstreamOperationState {
  /** Operation that ran. */
  operation: SquadUpstreamOperation;

  /** Targeted upstream, when applicable. */
  name?: string;

  /** Running, or finished with success / failure. */
  status: "running" | "succeeded" | "failed";

  /** Actionable error when {@link status} is `failed`. */
  error: SquadError | null;
}

/** Initial Squad state — empty and not ready until the host responds. */
export const initialSquadState: SquadState = {
  isReady: false,
  isLoading: false,
  error: null,
  detection: null,
  roster: [],
  charters: [],
  decisions: null,
  routing: null,
  modelConfig: null,
  logs: [],
  upstreams: [],
  upstreamRecommendations: null,
  marketplaces: [],
  plugins: [],
  lastPluginAction: null,
  backlog: initialSquadBacklogState,
  doctor: null,
  updates: null,
  cliUpgrade: null,
  importPreview: null,
  lastImport: null,
  presetPicker: initialSquadPresetPickerState,
  upstreamOperation: null,
  lastWrite: null,
};
