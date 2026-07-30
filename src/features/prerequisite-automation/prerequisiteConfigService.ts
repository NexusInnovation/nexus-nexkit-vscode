import * as path from "path";
import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { NodeFileSystem } from "./nodeFileSystem";
import { REQUIREMENTS_FILE_NAME, assertContained, resolveScriptsRootUri } from "./scriptResolver";
import {
  ConfigLoadResult,
  IFileSystem,
  IPrerequisiteLogger,
  Prerequisite,
  PrerequisiteConfig,
  PrerequisiteError,
  PrerequisiteInstallInfo,
} from "./types";

/** Hard caps so a hostile workspace file cannot exhaust memory or the UI. */
const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_PREREQUISITES = 200;
const MAX_STRING_LENGTH = 512;

const OPTIONAL_STRING_FIELDS = ["versionCommand", "minimumVersion"] as const;
const INSTALL_STRING_FIELDS: readonly (keyof PrerequisiteInstallInfo)[] = ["winget", "npm", "hint", "url"];

function assertString(value: unknown, field: string, index: number): string {
  if (typeof value !== "string") {
    throw new PrerequisiteError(
      "Configuration",
      `${REQUIREMENTS_FILE_NAME} is invalid: prerequisite #${index + 1} has a non-string "${field}".`
    );
  }
  if (value.length > MAX_STRING_LENGTH) {
    throw new PrerequisiteError(
      "Configuration",
      `${REQUIREMENTS_FILE_NAME} is invalid: prerequisite #${index + 1} has a "${field}" longer than ${MAX_STRING_LENGTH} characters.`
    );
  }
  return value;
}

/**
 * For fields that identify a prerequisite. An empty or whitespace-only `name` or
 * `command` would produce a blank consent prompt or an unrunnable check, so it
 * is rejected at the boundary rather than carried through the pipeline.
 */
function assertNonEmptyString(value: unknown, field: string, index: number): string {
  const text = assertString(value, field, index);
  if (text.trim().length === 0) {
    throw new PrerequisiteError(
      "Configuration",
      `${REQUIREMENTS_FILE_NAME} is invalid: prerequisite #${index + 1} has an empty "${field}".`
    );
  }
  return text;
}
function parseInstallInfo(raw: unknown, index: number): PrerequisiteInstallInfo | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new PrerequisiteError(
      "Configuration",
      `${REQUIREMENTS_FILE_NAME} is invalid: prerequisite #${index + 1} has a non-object "install".`
    );
  }

  const source = raw as Record<string, unknown>;
  const install: PrerequisiteInstallInfo = {};

  for (const field of INSTALL_STRING_FIELDS) {
    const value = source[field];
    if (value === undefined || value === null) {
      continue;
    }
    install[field] = assertString(value, `install.${field}`, index);
  }

  return install;
}

/**
 * Schema-validates the raw contents of `requirements.json`.
 *
 * `install.*` values are retained for display only. They are never executed and
 * never interpolated into a command line.
 */
export function parseRequirementsJson(rawText: string): PrerequisiteConfig {
  if (Buffer.byteLength(rawText, "utf8") > MAX_CONFIG_BYTES) {
    throw new PrerequisiteError(
      "Configuration",
      `${REQUIREMENTS_FILE_NAME} exceeds the ${Math.round(MAX_CONFIG_BYTES / 1024)} KB limit.`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new PrerequisiteError(
      "Configuration",
      `${REQUIREMENTS_FILE_NAME} is not valid JSON.`,
      "Fix the file, then run the command again."
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PrerequisiteError("Configuration", `${REQUIREMENTS_FILE_NAME} must contain a JSON object.`);
  }

  const rawPrerequisites = (parsed as Record<string, unknown>).prerequisites;
  if (!Array.isArray(rawPrerequisites)) {
    throw new PrerequisiteError(
      "Configuration",
      `${REQUIREMENTS_FILE_NAME} is missing a "prerequisites" array.`
    );
  }

  if (rawPrerequisites.length > MAX_PREREQUISITES) {
    throw new PrerequisiteError(
      "Configuration",
      `${REQUIREMENTS_FILE_NAME} declares more than ${MAX_PREREQUISITES} prerequisites.`
    );
  }

  const prerequisites: Prerequisite[] = rawPrerequisites.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new PrerequisiteError(
        "Configuration",
        `${REQUIREMENTS_FILE_NAME} is invalid: prerequisite #${index + 1} is not an object.`
      );
    }

    const source = entry as Record<string, unknown>;
    const prerequisite: Prerequisite = {
      name: assertNonEmptyString(source.name, "name", index),
      command: assertNonEmptyString(source.command, "command", index),
      required: source.required === undefined ? true : source.required === true,
    };

    if (source.required !== undefined && typeof source.required !== "boolean") {
      throw new PrerequisiteError(
        "Configuration",
        `${REQUIREMENTS_FILE_NAME} is invalid: prerequisite #${index + 1} has a non-boolean "required".`
      );
    }

    for (const field of OPTIONAL_STRING_FIELDS) {
      const value = source[field];
      if (value === undefined || value === null) {
        continue;
      }
      prerequisite[field] = assertString(value, field, index);
    }

    const install = parseInstallInfo(source.install, index);
    if (install) {
      prerequisite.install = install;
    }

    return prerequisite;
  });

  return { prerequisites };
}

/**
 * Locates and loads the target workspace's `requirements.json`.
 *
 * Nexkit ships no scripts of its own: everything is discovered inside the open
 * workspace, and a workspace without a prerequisites configuration is a normal,
 * silent outcome rather than an error.
 */
export class PrerequisiteConfigService {
  public constructor(
    private readonly _logging: IPrerequisiteLogger,
    private readonly _fileSystem: IFileSystem = new NodeFileSystem()
  ) {}

  /**
   * Candidate workspace roots, most specific first.
   *
   * Mirrors the precedent in `SettingsManager.isWorkspaceOverrideActive()`: the
   * folder holding the `.code-workspace` file wins, then each workspace folder,
   * so multi-root workspaces still resolve deterministically.
   */
  public getWorkspaceRootCandidates(): vscode.Uri[] {
    const candidates: vscode.Uri[] = [];
    const seen = new Set<string>();

    const add = (uri: vscode.Uri | undefined): void => {
      if (!uri || uri.scheme !== "file" || seen.has(uri.fsPath)) {
        return;
      }
      seen.add(uri.fsPath);
      candidates.push(uri);
    };

    const workspaceFile = vscode.workspace.workspaceFile;
    if (workspaceFile && workspaceFile.scheme === "file") {
      add(vscode.Uri.file(path.dirname(workspaceFile.fsPath)));
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      add(folder.uri);
    }

    return candidates;
  }

  /**
   * Resolves the first workspace root that actually carries a prerequisites
   * configuration, or reports `absent`.
   */
  public async load(): Promise<ConfigLoadResult> {
    const configuredPath = SettingsManager.getPrerequisitesScriptsPath();
    const candidates = this.getWorkspaceRootCandidates();

    if (candidates.length === 0) {
      this._logging.debug("Prerequisites: no file-system workspace folder is open.");
      return { kind: "absent" };
    }

    for (const workspaceRoot of candidates) {
      const scriptsRoot = resolveScriptsRootUri(workspaceRoot, configuredPath);
      const configPath = vscode.Uri.joinPath(scriptsRoot, REQUIREMENTS_FILE_NAME).fsPath;

      if (!(await this._fileSystem.fileExists(configPath))) {
        continue;
      }

      const containedScriptsRoot = await this._resolveContainedScriptsRoot(workspaceRoot, scriptsRoot);
      const rawText = await this._readConfig(configPath);

      return {
        kind: "found",
        config: parseRequirementsJson(rawText),
        configPath,
        scriptsRoot: containedScriptsRoot,
        workspaceRoot,
      };
    }

    this._logging.debug(`Prerequisites: no ${REQUIREMENTS_FILE_NAME} found in any workspace root.`);
    return { kind: "absent" };
  }

  /**
   * Re-asserts containment after symlink resolution so a symlinked scripts
   * directory cannot redirect execution outside the workspace.
   */
  private async _resolveContainedScriptsRoot(workspaceRoot: vscode.Uri, scriptsRoot: vscode.Uri): Promise<vscode.Uri> {
    try {
      const realWorkspaceRoot = await this._fileSystem.realPath(workspaceRoot.fsPath);
      const realScriptsRoot = await this._fileSystem.realPath(scriptsRoot.fsPath);
      assertContained(realScriptsRoot, realWorkspaceRoot);
      return vscode.Uri.file(realScriptsRoot);
    } catch (error) {
      if (error instanceof PrerequisiteError) {
        throw error;
      }
      // Symlink resolution is unavailable (permissions, virtual FS); the
      // pre-realpath containment assertion already passed.
      return scriptsRoot;
    }
  }

  private async _readConfig(configPath: string): Promise<string> {
    // Stat before reading: applying the cap to an already-loaded string is not a
    // cap at all, since the whole file is in memory by then. The post-parse check
    // in parseRequirementsJson stays as defence in depth for callers that reach
    // it directly or through a filesystem that cannot report a size.
    try {
      const sizeBytes = await this._fileSystem.fileSizeBytes?.(configPath);
      if (sizeBytes !== undefined && sizeBytes > MAX_CONFIG_BYTES) {
        throw new PrerequisiteError(
          "Configuration",
          `${REQUIREMENTS_FILE_NAME} exceeds the ${Math.round(MAX_CONFIG_BYTES / 1024)} KB limit.`
        );
      }
    } catch (error) {
      if (error instanceof PrerequisiteError) {
        throw error;
      }
      // The size probe is best-effort; a failure here falls through to the read,
      // which reports the real problem.
    }

    try {
      return await this._fileSystem.readTextFile(configPath);
    } catch (error) {
      this._logging.error("Prerequisites: unable to read the requirements file.", error);
      throw new PrerequisiteError(
        "Permission",
        `${REQUIREMENTS_FILE_NAME} could not be read.`,
        "Check the file permissions, then run the command again."
      );
    }
  }
}
