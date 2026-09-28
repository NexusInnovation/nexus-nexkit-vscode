/**
 * Domain types for validating a Squad preset `squad/` folder against the
 * Nexus preset contract.
 *
 * Covers PRD FR-010 (surface presets), FR-011 (reserved `squad/` sub-folder)
 * and FR-012 (preset sources), and encodes the "Contrat du preset Squad Nexus"
 * rules from `docs/prd/squad-management.md`:
 *
 * - Paths must be relative to `squad/` — no absolute paths, no `..` traversal,
 *   no symlinks, no dangerous/executable extensions.
 * - A `manifest.json` must exist, parse, advertise a supported `schemaVersion`
 *   and the required identity fields, and declare its required/optional files.
 * - Every `files.required` pattern must be satisfied by the folder listing.
 *
 * These types are `vscode`-free so they can be imported from both the
 * extension host and the Preact webview.
 */

/** The canonical manifest file name at the root of a preset `squad/` folder. */
export const SQUAD_PRESET_MANIFEST_FILE = "manifest.json";

/** Manifest `schemaVersion` values this validator understands. */
export const SQUAD_PRESET_SUPPORTED_SCHEMA_VERSIONS = [1] as const;

/**
 * Files that must always exist in a preset regardless of what the manifest
 * declares. `team.md` backs the roster (FR-022) and is the minimum a preset
 * must provide to be usable.
 */
export const SQUAD_PRESET_BASELINE_REQUIRED_FILES = ["team.md"] as const;

/**
 * File extensions considered dangerous inside a preset. The contract forbids
 * executables, scripts and install commands, so any listed path with one of
 * these extensions is an error.
 */
export const SQUAD_PRESET_DANGEROUS_EXTENSIONS = [
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".com",
  ".msi",
  ".scr",
  ".bat",
  ".cmd",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".psm1",
  ".vbs",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".py",
  ".rb",
  ".pl",
  ".php",
  ".jar",
  ".app",
] as const;

/**
 * Extensions expected inside a preset. Anything else is surfaced as a warning
 * (never a silent success) so maintainers can confirm the content is stable
 * Markdown/JSON.
 */
export const SQUAD_PRESET_EXPECTED_EXTENSIONS = [".md", ".json"] as const;

/** Machine-readable classification for a single preset validation issue. */
export const SquadPresetIssueCode = {
  /** The `squad/` listing was empty. */
  EmptyListing: "empty-listing",
  /** `manifest.json` was not present in the listing. */
  ManifestMissing: "manifest-missing",
  /** `manifest.json` could not be read (no content reader / read failed). */
  ManifestUnreadable: "manifest-unreadable",
  /** `manifest.json` content was not valid JSON. */
  ManifestInvalidJson: "manifest-invalid-json",
  /** `manifest.json` advertised an unsupported `schemaVersion`. */
  ManifestSchemaUnsupported: "manifest-schema-unsupported",
  /** A required manifest identity field was missing or empty. */
  ManifestFieldMissing: "manifest-field-missing",
  /** A `files.required` pattern was not matched by any listed path. */
  RequiredFileMissing: "required-file-missing",
  /** A path escaped the `squad/` root (absolute path). */
  AbsolutePath: "absolute-path",
  /** A path contained a `..` traversal segment. */
  PathTraversal: "path-traversal",
  /** A path used a dangerous/executable extension. */
  DangerousExtension: "dangerous-extension",
  /** A path was reported as a symbolic link. */
  Symlink: "symlink",
  /** A path used an extension outside the expected Markdown/JSON set. */
  UnexpectedExtension: "unexpected-extension",
  /** A readable text file appeared to contain a secret/token. */
  PotentialSecret: "potential-secret",
} as const;

export type SquadPresetIssueCode = (typeof SquadPresetIssueCode)[keyof typeof SquadPresetIssueCode];

/** Severity of a single preset validation diagnostic. */
export const SquadPresetDiagnosticSeverity = {
  /** Blocks acceptance — the preset is invalid. */
  Error: "error",
  /** Non-blocking — the preset is usable but should be reviewed. */
  Warning: "warning",
} as const;

export type SquadPresetDiagnosticSeverity =
  (typeof SquadPresetDiagnosticSeverity)[keyof typeof SquadPresetDiagnosticSeverity];

/**
 * A single, actionable finding produced while validating a preset. Never a
 * silent success: every problem is a diagnostic with a user-facing message
 * and, where relevant, the offending `squad/`-relative path.
 */
export interface SquadPresetDiagnostic {
  /** Machine-readable classification. */
  code: SquadPresetIssueCode;

  /** Whether this diagnostic blocks acceptance. */
  severity: SquadPresetDiagnosticSeverity;

  /** Human-readable, user-facing description of the problem. */
  message: string;

  /** The offending `squad/`-relative path, when the finding is path-scoped. */
  path?: string;

  /** Actionable next step to resolve the finding. */
  remediation?: string;
}

/** Declared required/optional file globs from a preset manifest. */
export interface SquadPresetManifestFiles {
  /** Glob patterns (relative to `squad/`) that must exist. */
  required?: string[];

  /** Glob patterns (relative to `squad/`) that may exist. */
  optional?: string[];
}

/**
 * Parsed shape of a preset `manifest.json`. Only the fields NexKit relies on
 * are typed; unknown fields are preserved by the raw parse but ignored here.
 */
export interface SquadPresetManifest {
  /** Manifest schema version. */
  schemaVersion: number;

  /** Stable preset identifier. */
  id: string;

  /** Display name for the preset. */
  displayName: string;

  /** Short description. */
  description?: string;

  /** Required Squad CLI version range (e.g. ">=0.13.0"). */
  squadCliVersion?: string;

  /** Squad level advertised by the preset (e.g. "team"). */
  level?: string;

  /** Origin descriptor declared by the manifest. */
  source?: {
    type?: string;
    pluginId?: string;
    repository?: string;
  };

  /** Declared required/optional files. */
  files?: SquadPresetManifestFiles;

  /** Declared upstream sources. */
  upstreams?: unknown[];

  /** Declared Squad plugins. */
  plugins?: unknown[];

  /** Recommended backlog integrations. */
  recommendedBacklog?: string[];
}

/**
 * Outcome of validating a preset `squad/` folder against the contract.
 *
 * `valid` is true only when there are no error-severity diagnostics; warnings
 * may still be present. When valid, `manifest` and `preset` are populated.
 */
export interface SquadPresetValidation {
  /** True when no error-severity diagnostics were produced. */
  valid: boolean;

  /** All findings, in the order they were discovered. */
  diagnostics: SquadPresetDiagnostic[];

  /** Parsed manifest, when it was present and parseable. */
  manifest?: SquadPresetManifest;
}
