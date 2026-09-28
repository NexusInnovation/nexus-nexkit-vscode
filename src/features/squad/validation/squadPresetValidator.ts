/**
 * Pure, dependency-free validator for a Squad preset `squad/` folder.
 *
 * Implements the "Contrat du preset Squad Nexus" rules from
 * `docs/prd/squad-management.md` (SQD-015, PRD FR-010/FR-011/FR-012). The
 * validator takes an abstract input — a listing of `squad/`-relative paths
 * plus an optional text-content reader — so both local marketplace plugins
 * (SQD-017) and remote GitHub sources (SQD-016/SQD-018) can reuse it without
 * touching the file system or `vscode` API directly.
 *
 * Downstream (preset resolution, SQD-020 init) consumes either the rich
 * {@link SquadPresetValidation} report via {@link validateSquadPreset} or the
 * SQD-001 {@link SquadResult} adapter via {@link validateSquadPresetAsResult}.
 */

import { SquadPreset, SquadPresetSource } from "../models/squadPreset";
import { squadErr, squadOk, SquadResult } from "../models/squadResult";
import {
  SquadPresetDiagnostic,
  SquadPresetDiagnosticSeverity,
  SquadPresetIssueCode,
  SquadPresetManifest,
  SquadPresetValidation,
  SQUAD_PRESET_BASELINE_REQUIRED_FILES,
  SQUAD_PRESET_DANGEROUS_EXTENSIONS,
  SQUAD_PRESET_EXPECTED_EXTENSIONS,
  SQUAD_PRESET_MANIFEST_FILE,
  SQUAD_PRESET_SUPPORTED_SCHEMA_VERSIONS,
} from "../models/squadPresetValidation";

/**
 * Abstract input for {@link validateSquadPreset}. Kept storage-agnostic so a
 * local folder walk and a GitHub tree listing can both feed it.
 */
export interface SquadPresetValidationInput {
  /**
   * File paths relative to the preset `squad/` folder root, using `/`
   * separators (e.g. `manifest.json`, `agents/link/charter.md`).
   */
  paths: string[];

  /**
   * Optional reader returning the UTF-8 text content of a `squad/`-relative
   * file, or `undefined` when it cannot be read. Required to validate and
   * parse `manifest.json`.
   */
  readTextFile?: (relativePath: string) => string | undefined;

  /**
   * Paths (from {@link paths}) that the source reported as symbolic links.
   * Symlinks are forbidden by the contract; a caller that cannot detect them
   * may omit this.
   */
  symlinkPaths?: string[];

  /**
   * Origin of the preset, used to populate the built {@link SquadPreset}
   * descriptor on success. When omitted, the descriptor source is derived from
   * the manifest.
   */
  source?: SquadPresetSource;
}

/** Normalise a path to `/` separators and strip a redundant leading `./`. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Lower-cased extension (including the dot) of a path, or "" when none. */
function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

/** Whether a path is absolute (POSIX root, Windows drive, or UNC). */
function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:/.test(path) || path.startsWith("\\\\");
}

/** Whether any segment of a path is a `..` traversal. */
function hasTraversal(path: string): boolean {
  return path.split("/").some((segment) => segment === "..");
}

/**
 * Compile a manifest glob (segments separated by `/`, `*` matching a single
 * segment, `**` matching any number of segments) to an anchored RegExp.
 */
function globToRegExp(glob: string): RegExp {
  const parts = glob.split("/").map((segment) => {
    if (segment === "**") {
      return null;
    }
    return segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  });

  let pattern = "";
  parts.forEach((part, index) => {
    if (part === null) {
      // `**` matches one or more path segments.
      pattern += index === 0 ? ".+" : "(?:/.+)";
    } else {
      pattern += index === 0 ? part : `/${part}`;
    }
  });

  return new RegExp(`^${pattern}$`);
}

/** Whether at least one listed path satisfies a required glob. */
function isPatternSatisfied(pattern: string, paths: string[]): boolean {
  const regex = globToRegExp(pattern);
  return paths.some((path) => regex.test(path));
}

/** Heuristic secret patterns scanned in readable text files. */
const SECRET_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  {
    label: "private key block",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  },
  {
    label: "bearer/authorization token",
    regex: /\b[Aa]uthorization\s*[:=]\s*['"]?[Bb]earer\s+[A-Za-z0-9._-]{12,}/,
  },
];

function diagnostic(
  code: SquadPresetIssueCode,
  severity: SquadPresetDiagnosticSeverity,
  message: string,
  extra?: { path?: string; remediation?: string },
): SquadPresetDiagnostic {
  return {
    code,
    severity,
    message,
    ...(extra?.path !== undefined ? { path: extra.path } : {}),
    ...(extra?.remediation !== undefined ? { remediation: extra.remediation } : {}),
  };
}

/** Validate the raw parsed manifest and collect diagnostics. */
function validateManifest(
  raw: unknown,
  diagnostics: SquadPresetDiagnostic[],
): SquadPresetManifest | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.ManifestInvalidJson,
        SquadPresetDiagnosticSeverity.Error,
        `${SQUAD_PRESET_MANIFEST_FILE} must contain a JSON object.`,
        {
          path: SQUAD_PRESET_MANIFEST_FILE,
          remediation: `Ensure ${SQUAD_PRESET_MANIFEST_FILE} is a JSON object with at least schemaVersion, id and displayName.`,
        },
      ),
    );
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const manifest = record as unknown as SquadPresetManifest;

  const schemaVersion = record.schemaVersion;
  if (typeof schemaVersion !== "number") {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.ManifestFieldMissing,
        SquadPresetDiagnosticSeverity.Error,
        `${SQUAD_PRESET_MANIFEST_FILE} is missing a numeric "schemaVersion".`,
        {
          path: SQUAD_PRESET_MANIFEST_FILE,
          remediation: `Add "schemaVersion": ${SQUAD_PRESET_SUPPORTED_SCHEMA_VERSIONS[0]} to ${SQUAD_PRESET_MANIFEST_FILE}.`,
        },
      ),
    );
  } else if (!SQUAD_PRESET_SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion as 1)) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.ManifestSchemaUnsupported,
        SquadPresetDiagnosticSeverity.Error,
        `Unsupported preset schemaVersion ${schemaVersion}.`,
        {
          path: SQUAD_PRESET_MANIFEST_FILE,
          remediation: `Use one of the supported schema versions: ${SQUAD_PRESET_SUPPORTED_SCHEMA_VERSIONS.join(", ")}.`,
        },
      ),
    );
  }

  for (const field of ["id", "displayName"] as const) {
    const value = record[field];
    if (typeof value !== "string" || value.trim() === "") {
      diagnostics.push(
        diagnostic(
          SquadPresetIssueCode.ManifestFieldMissing,
          SquadPresetDiagnosticSeverity.Error,
          `${SQUAD_PRESET_MANIFEST_FILE} is missing a non-empty "${field}".`,
          {
            path: SQUAD_PRESET_MANIFEST_FILE,
            remediation: `Add a non-empty "${field}" string to ${SQUAD_PRESET_MANIFEST_FILE}.`,
          },
        ),
      );
    }
  }

  return manifest;
}

/** Validate the required-file globs declared by the manifest and baseline. */
function validateRequiredFiles(
  manifest: SquadPresetManifest | undefined,
  paths: string[],
  diagnostics: SquadPresetDiagnostic[],
): void {
  const patterns = new Set<string>(SQUAD_PRESET_BASELINE_REQUIRED_FILES);
  const declared = manifest?.files?.required;
  if (Array.isArray(declared)) {
    for (const pattern of declared) {
      if (typeof pattern === "string" && pattern.trim() !== "") {
        patterns.add(normalizePath(pattern.trim()));
      }
    }
  }

  for (const pattern of patterns) {
    if (!isPatternSatisfied(pattern, paths)) {
      diagnostics.push(
        diagnostic(
          SquadPresetIssueCode.RequiredFileMissing,
          SquadPresetDiagnosticSeverity.Error,
          `Required preset file "${pattern}" is missing from the squad/ folder.`,
          {
            path: pattern,
            remediation: `Add a file matching "${pattern}" to the preset squad/ folder.`,
          },
        ),
      );
    }
  }
}

/** Validate a single listed path for safety and expected content type. */
function validatePathSafety(
  path: string,
  symlinks: Set<string>,
  diagnostics: SquadPresetDiagnostic[],
): void {
  if (isAbsolutePath(path)) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.AbsolutePath,
        SquadPresetDiagnosticSeverity.Error,
        `Preset path "${path}" is absolute; paths must be relative to squad/.`,
        { path, remediation: "Use a path relative to the squad/ folder." },
      ),
    );
    return;
  }

  if (hasTraversal(path)) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.PathTraversal,
        SquadPresetDiagnosticSeverity.Error,
        `Preset path "${path}" escapes squad/ with a ".." segment.`,
        { path, remediation: "Remove parent-directory (..) segments from the path." },
      ),
    );
    return;
  }

  if (symlinks.has(path)) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.Symlink,
        SquadPresetDiagnosticSeverity.Error,
        `Preset path "${path}" is a symbolic link, which is not allowed.`,
        { path, remediation: "Replace the symlink with a regular file." },
      ),
    );
    return;
  }

  const extension = extensionOf(path);
  if (SQUAD_PRESET_DANGEROUS_EXTENSIONS.includes(extension as ".exe")) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.DangerousExtension,
        SquadPresetDiagnosticSeverity.Error,
        `Preset path "${path}" uses a forbidden executable/script extension "${extension}".`,
        { path, remediation: "Presets may only contain stable Markdown/JSON files." },
      ),
    );
    return;
  }

  if (extension !== "" && !SQUAD_PRESET_EXPECTED_EXTENSIONS.includes(extension as ".md")) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.UnexpectedExtension,
        SquadPresetDiagnosticSeverity.Warning,
        `Preset path "${path}" uses an unexpected extension "${extension}".`,
        {
          path,
          remediation: `Prefer ${SQUAD_PRESET_EXPECTED_EXTENSIONS.join("/")} files inside a preset.`,
        },
      ),
    );
  }
}

/** Scan a readable text file for obvious secrets. */
function scanForSecrets(
  path: string,
  readTextFile: (relativePath: string) => string | undefined,
  diagnostics: SquadPresetDiagnostic[],
): void {
  let content: string | undefined;
  try {
    content = readTextFile(path);
  } catch {
    return;
  }
  if (content === undefined) {
    return;
  }
  for (const { label, regex } of SECRET_PATTERNS) {
    if (regex.test(content)) {
      diagnostics.push(
        diagnostic(
          SquadPresetIssueCode.PotentialSecret,
          SquadPresetDiagnosticSeverity.Warning,
          `Preset file "${path}" appears to contain a ${label}.`,
          {
            path,
            remediation:
              "Remove secrets, tokens, personal paths and workspace names from preset files.",
          },
        ),
      );
    }
  }
}

/**
 * Validate a preset `squad/` folder against the Nexus preset contract.
 *
 * Pure and synchronous: it never touches the file system or `vscode`. Callers
 * provide the listing and (optionally) a text reader for `manifest.json` and
 * secret scanning.
 *
 * @returns a {@link SquadPresetValidation}. `valid` is true only when no
 * error-severity diagnostics were produced; warnings may still be present.
 */
export function validateSquadPreset(input: SquadPresetValidationInput): SquadPresetValidation {
  const diagnostics: SquadPresetDiagnostic[] = [];
  const symlinks = new Set((input.symlinkPaths ?? []).map(normalizePath));
  const paths = input.paths.map(normalizePath);

  if (paths.length === 0) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.EmptyListing,
        SquadPresetDiagnosticSeverity.Error,
        "The preset squad/ folder is empty.",
        {
          remediation: `Provide at least ${SQUAD_PRESET_MANIFEST_FILE} and the required preset files.`,
        },
      ),
    );
    return { valid: false, diagnostics };
  }

  for (const path of paths) {
    validatePathSafety(path, symlinks, diagnostics);
  }

  let manifest: SquadPresetManifest | undefined;
  if (!paths.includes(SQUAD_PRESET_MANIFEST_FILE)) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.ManifestMissing,
        SquadPresetDiagnosticSeverity.Error,
        `Preset is missing ${SQUAD_PRESET_MANIFEST_FILE}.`,
        {
          path: SQUAD_PRESET_MANIFEST_FILE,
          remediation: `Add a ${SQUAD_PRESET_MANIFEST_FILE} at the root of the squad/ folder.`,
        },
      ),
    );
  } else if (!input.readTextFile) {
    diagnostics.push(
      diagnostic(
        SquadPresetIssueCode.ManifestUnreadable,
        SquadPresetDiagnosticSeverity.Error,
        `${SQUAD_PRESET_MANIFEST_FILE} could not be read to validate the preset.`,
        {
          path: SQUAD_PRESET_MANIFEST_FILE,
          remediation: "Provide a content reader so the manifest can be validated.",
        },
      ),
    );
  } else {
    let rawContent: string | undefined;
    try {
      rawContent = input.readTextFile(SQUAD_PRESET_MANIFEST_FILE);
    } catch {
      rawContent = undefined;
    }
    if (rawContent === undefined) {
      diagnostics.push(
        diagnostic(
          SquadPresetIssueCode.ManifestUnreadable,
          SquadPresetDiagnosticSeverity.Error,
          `${SQUAD_PRESET_MANIFEST_FILE} could not be read to validate the preset.`,
          {
            path: SQUAD_PRESET_MANIFEST_FILE,
            remediation: "Ensure the manifest file is readable.",
          },
        ),
      );
    } else {
      let parsed: unknown;
      let parseFailed = false;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        parseFailed = true;
        diagnostics.push(
          diagnostic(
            SquadPresetIssueCode.ManifestInvalidJson,
            SquadPresetDiagnosticSeverity.Error,
            `${SQUAD_PRESET_MANIFEST_FILE} is not valid JSON.`,
            {
              path: SQUAD_PRESET_MANIFEST_FILE,
              remediation: "Fix the JSON syntax in the manifest.",
            },
          ),
        );
      }
      if (!parseFailed) {
        manifest = validateManifest(parsed, diagnostics);
      }
    }
  }

  validateRequiredFiles(manifest, paths, diagnostics);

  if (input.readTextFile) {
    for (const path of paths) {
      const extension = extensionOf(path);
      if (SQUAD_PRESET_EXPECTED_EXTENSIONS.includes(extension as ".md")) {
        scanForSecrets(path, input.readTextFile, diagnostics);
      }
    }
  }

  const valid = !diagnostics.some((d) => d.severity === SquadPresetDiagnosticSeverity.Error);
  return { valid, diagnostics, ...(manifest ? { manifest } : {}) };
}

/**
 * Build a {@link SquadPreset} descriptor from a validated manifest.
 * Prefers the caller-supplied source, otherwise derives one from the manifest.
 */
export function buildSquadPreset(
  manifest: SquadPresetManifest,
  source?: SquadPresetSource,
): SquadPreset {
  const resolvedSource: SquadPresetSource = source ?? {
    kind: "marketplace",
    pluginId: manifest.source?.pluginId ?? manifest.id,
    ...(manifest.source?.repository ? { repository: manifest.source.repository } : {}),
    squadFolderPath: "squad",
  };

  return {
    id: manifest.id,
    name: manifest.displayName,
    ...(manifest.description ? { description: manifest.description } : {}),
    source: resolvedSource,
    version: String(manifest.schemaVersion),
  };
}

/**
 * SQD-001 adapter: validate a preset and return a {@link SquadResult}.
 *
 * On success, carries the built {@link SquadPreset} descriptor. On failure,
 * returns a `preset-invalid` error whose `detail` enumerates every blocking
 * diagnostic so the failure is visible and actionable.
 */
export function validateSquadPresetAsResult(
  input: SquadPresetValidationInput,
): SquadResult<SquadPreset> {
  const validation = validateSquadPreset(input);

  if (!validation.valid || !validation.manifest) {
    const errors = validation.diagnostics.filter(
      (d) => d.severity === SquadPresetDiagnosticSeverity.Error,
    );
    const primary = errors[0];
    return squadErr({
      code: "preset-invalid",
      message: primary ? `Invalid Squad preset: ${primary.message}` : "Invalid Squad preset.",
      ...(primary?.remediation ? { remediation: primary.remediation } : {}),
      detail: errors.map((d) => `[${d.code}] ${d.message}`).join("; "),
    });
  }

  return squadOk(buildSquadPreset(validation.manifest, input.source));
}
