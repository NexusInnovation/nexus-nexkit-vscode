import * as path from "path";
import * as vscode from "vscode";
import { PrerequisiteError, PrerequisiteStep } from "./types";

/**
 * Allowlisted script filenames per platform. The user configures a *directory*
 * and never a filename, so nothing outside this table can ever be executed.
 */
const WINDOWS_SCRIPTS: Readonly<Record<PrerequisiteStep, string>> = {
  check: "Check-Validation.ps1",
  validate: "Validate-Prerequisites.ps1",
  setup: "Setup-Environment.ps1",
};

const POSIX_SCRIPTS: Readonly<Record<PrerequisiteStep, string>> = {
  check: "check-validation.sh",
  validate: "validate-prerequisites.sh",
  setup: "setup-environment.sh",
};

const SUPPORTED_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set<NodeJS.Platform>(["win32", "linux", "darwin"]);

export const REQUIREMENTS_FILE_NAME = "requirements.json";

export const DEFAULT_SCRIPTS_PATH = "scripts";

/**
 * The complete set of filenames this feature may ever execute.
 */
export const ALLOWED_SCRIPT_FILE_NAMES: readonly string[] = [
  ...Object.values(WINDOWS_SCRIPTS),
  ...Object.values(POSIX_SCRIPTS),
];

export function isSupportedPlatform(platform: NodeJS.Platform): boolean {
  return SUPPORTED_PLATFORMS.has(platform);
}

/**
 * Maps a phase and a platform to a script filename.
 *
 * The platform is an explicit parameter and is never read from `process.platform`,
 * so both OS branches are exercisable on a single test runner.
 */
export function resolveScriptFileName(step: PrerequisiteStep, platform: NodeJS.Platform): string {
  if (!isSupportedPlatform(platform)) {
    throw new PrerequisiteError(
      "Configuration",
      `Prerequisite automation does not support the "${platform}" platform.`,
      "Supported platforms are Windows, Linux, and macOS."
    );
  }

  return platform === "win32" ? WINDOWS_SCRIPTS[step] : POSIX_SCRIPTS[step];
}

export function isAllowedScriptFileName(fileName: string): boolean {
  return ALLOWED_SCRIPT_FILE_NAMES.includes(fileName);
}

/**
 * Splits a user-supplied relative directory into safe path segments.
 *
 * Rejects absolute paths, drive-qualified paths, UNC paths, and any `..` segment.
 */
export function toSafeRelativeSegments(configuredPath: string): string[] {
  const trimmed = configuredPath.trim();
  if (trimmed.length === 0) {
    return [DEFAULT_SCRIPTS_PATH];
  }

  if (path.isAbsolute(trimmed) || /^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) {
    throw new PrerequisiteError(
      "Configuration",
      "The prerequisite scripts path must be relative to the workspace root.",
      `Update "nexkit.prerequisites.scriptsPath" to a relative directory such as "${DEFAULT_SCRIPTS_PATH}".`
    );
  }

  const segments = trimmed
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== ".");

  if (segments.some((segment) => segment === "..")) {
    throw new PrerequisiteError(
      "Configuration",
      "The prerequisite scripts path must not navigate outside the workspace root.",
      `Update "nexkit.prerequisites.scriptsPath" to a relative directory such as "${DEFAULT_SCRIPTS_PATH}".`
    );
  }

  return segments.length > 0 ? segments : [DEFAULT_SCRIPTS_PATH];
}

/**
 * Asserts that `candidateFsPath` resolves inside `rootFsPath`.
 *
 * Call this again after `realpath` so a symlink cannot redirect execution outside
 * the workspace.
 */
export function assertContained(candidateFsPath: string, rootFsPath: string): void {
  const normalizedRoot = path.resolve(rootFsPath);
  const normalizedCandidate = path.resolve(candidateFsPath);
  const rootWithSeparator = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;

  if (normalizedCandidate !== normalizedRoot && !normalizedCandidate.startsWith(rootWithSeparator)) {
    throw new PrerequisiteError(
      "Configuration",
      "The prerequisite scripts path resolves outside the workspace root.",
      `Update "nexkit.prerequisites.scriptsPath" to a directory inside the workspace.`
    );
  }
}

/**
 * Resolves the configured scripts directory against a workspace root and asserts
 * containment. Symlink resolution happens separately, once the filesystem seam
 * is available.
 */
export function resolveScriptsRootUri(workspaceRoot: vscode.Uri, configuredPath: string): vscode.Uri {
  const segments = toSafeRelativeSegments(configuredPath);
  const resolved = vscode.Uri.joinPath(workspaceRoot, ...segments);
  assertContained(resolved.fsPath, workspaceRoot.fsPath);
  return resolved;
}

/**
 * Resolves an allowlisted script filename inside an already-validated scripts root.
 */
export function resolveScriptUri(scriptsRoot: vscode.Uri, fileName: string): vscode.Uri {
  if (!isAllowedScriptFileName(fileName)) {
    throw new PrerequisiteError("Configuration", `"${fileName}" is not an allowed prerequisite script.`);
  }
  return vscode.Uri.joinPath(scriptsRoot, fileName);
}

/**
 * Parses the `::VALIDATED::true|false` marker emitted by the check script.
 * Returns `undefined` when no marker is present.
 *
 * Deliberately strict, matching the script contract exactly: case-sensitive, no
 * separator between the marker and its value, and the *first* occurrence wins
 * because the reference scripts emit the marker before anything else. A trailing
 * `\r` is harmless — the pattern stops at the value — which is what keeps the
 * CRLF-terminated `Check-Validation.ps1` working.
 */
export function parseValidationMarker(stdout: string): boolean | undefined {
  const match = /::VALIDATED::(true|false)/.exec(stdout);
  return match ? match[1] === "true" : undefined;
}
