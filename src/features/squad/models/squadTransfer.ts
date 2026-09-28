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
