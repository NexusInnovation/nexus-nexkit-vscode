/**
 * Shared Squad transfer contracts for export/import flows (SQD-033/SQD-034).
 *
 * The same target shape is used by export (destination) and import (source),
 * so the preview/import flow can reuse the file/GitHub addressing contract
 * without coupling to VS Code APIs across the webview message boundary.
 */

/** Transfer locations supported by the Squad export/import contract. */
export const SquadTransferTargetKind = {
  File: "file",
  GitHub: "github",
} as const;

export type SquadTransferTargetKind =
  (typeof SquadTransferTargetKind)[keyof typeof SquadTransferTargetKind];

/** Local file target/source. URI strings are used so messages stay serialisable. */
export interface SquadFileTransferTarget {
  kind: typeof SquadTransferTargetKind.File;

  /** Optional `file:` URI. When omitted for export, the host prompts for a file. */
  uri?: string;

  /** Optional default filename for the host file picker. */
  defaultFileName?: string;
}

/** GitHub repository target/source, delegated to the Squad CLI when supported. */
export interface SquadGitHubTransferTarget {
  kind: typeof SquadTransferTargetKind.GitHub;

  /** Repository in `owner/repo` form. */
  repository: string;

  /** Optional branch/ref passed through to the CLI. */
  ref?: string;

  /** Optional repository path passed through to the CLI. */
  path?: string;
}

/** Shared serialisable transfer address for Squad export/import. */
export type SquadTransferTarget = SquadFileTransferTarget | SquadGitHubTransferTarget;

/** Webview/command request for exporting Squad data. */
export interface SquadExportRequest {
  /** Destination for the export. Defaults to a host file picker. */
  target?: SquadTransferTarget;
}

/** Successful Squad export outcome. */
export interface SquadExportOutcome {
  /** Where the export was written/published. */
  target: SquadTransferTarget;

  /** Epoch milliseconds when the export completed. */
  exportedAt: number;

  /** Sanitised CLI stdout; may be empty. */
  stdout: string;

  /** Sanitised CLI stderr; may contain warnings. */
  stderr: string;

  /** CLI duration in milliseconds. */
  durationMs: number;
}

/** Webview/command request for previewing a Squad import (SQD-034). */
export interface SquadImportPreviewRequest {
  /** Import source. Defaults to a host open-file dialog. */
  source?: SquadTransferTarget;
}

/** How an import affects a workspace path. */
export const SquadImportChangeKind = {
  Create: "create",
  Overwrite: "overwrite",
} as const;

export type SquadImportChangeKind = (typeof SquadImportChangeKind)[keyof typeof SquadImportChangeKind];

/** One workspace file the import will write. */
export interface SquadImportFileChange {
  /** Workspace-root-relative POSIX path. */
  relativePath: string;

  /** Whether the file is new or replaces an existing file. */
  change: SquadImportChangeKind;
}

/** One agent carried by the export manifest. */
export interface SquadImportAgentPreview {
  /** Agent folder name (validated safe slug). */
  name: string;

  /** True when the manifest carries a charter for this agent. */
  hasCharter: boolean;

  /** True when the manifest carries history (split into portable knowledge by the CLI). */
  hasHistory: boolean;

  /** Whether the agent folder is new or replaces an existing agent. */
  change: SquadImportChangeKind;
}

/** One skill carried by the export manifest. */
export interface SquadImportSkillPreview {
  /** Resolved skill folder name under `.copilot/skills/`. */
  name: string;

  /** Whether the skill is new or replaces an existing skill. */
  change: SquadImportChangeKind;
}

/**
 * Preview of a Squad import, computed by NexKit before anything is written.
 * The host keeps the previewed manifest staged so the applied content is
 * exactly what was previewed.
 */
export interface SquadImportPreview {
  /** Opaque identifier to pass back when applying this preview. */
  previewId: string;

  /** Normalised import source. */
  source: SquadTransferTarget;

  /** Human-readable source label (file name or `owner/repo`). */
  sourceLabel: string;

  /** Export manifest format version (currently `1.0`). */
  manifestVersion: string;

  /** ISO timestamp recorded by `squad export`, when present. */
  exportedAt?: string;

  /** Squad CLI version that produced the export, when present. */
  squadVersion?: string;

  /** Casting universe carried by the export, when present. */
  universe?: string;

  /** Squad directory the CLI will import into (`.squad` or legacy `.ai-team`). */
  squadDirectory: string;

  /** True when a Squad already exists; the CLI archives it and NexKit backs it up first. */
  hasExistingSquad: boolean;

  /** Agents that will be written. */
  agents: SquadImportAgentPreview[];

  /** Skills that will be written under `.copilot/skills/`. */
  skills: SquadImportSkillPreview[];

  /** Casting state files (`<key>.json`) that will be written. */
  castingKeys: string[];

  /** Every workspace file the import will write. */
  files: SquadImportFileChange[];

  /** Non-blocking notices the user should review before applying. */
  warnings: string[];

  /** Epoch milliseconds when the preview was created. */
  createdAt: number;
}

/** Webview/command request for applying a previously previewed import. */
export interface SquadImportApplyRequest {
  /** Identifier returned by the preview. */
  previewId: string;
}

/** Successful Squad import outcome (serialisable; no absolute paths). */
export interface SquadImportOutcome {
  /** Identifier of the applied preview. */
  previewId: string;

  /** Import source. */
  source: SquadTransferTarget;

  /** Epoch milliseconds when the import completed. */
  importedAt: number;

  /** Number of agents imported. */
  agentCount: number;

  /** Number of skills imported. */
  skillCount: number;

  /** True when BackupService captured existing artifacts before the import. */
  backupCreated: boolean;

  /** Sanitised CLI stdout; may be empty. */
  stdout: string;

  /** Sanitised CLI stderr; may contain warnings. */
  stderr: string;

  /** CLI duration in milliseconds. */
  durationMs: number;
}
