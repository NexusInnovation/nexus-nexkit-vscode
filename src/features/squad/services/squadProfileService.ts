/**
 * Profile integration for Squad configuration (SQD-048 / FR-065).
 *
 * NexKit profiles persist a structured `squad` object alongside installed AI
 * templates. This service snapshots the current workspace configuration and
 * restores the file-backed parts with BackupService-first semantics.
 */

import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SquadMarketplaceRef,
  SquadPluginRef,
  SquadProfileConfig,
  SquadRalphPreferences,
  SquadResult,
  SquadUpstreamSource,
  isSquadErr,
  squadErr,
  squadOk,
} from "../models";
import { serializeSquadModelConfig } from "../validation/squadModelConfigValidator";
import { SquadArtifactBackup } from "./squadInitService";
import { SquadFileService } from "./squadFileService";
import { SquadPluginService } from "./squadPluginService";

const SQUAD_DIR = ".squad";
const SQUAD_CONFIG_RELATIVE_PATH = ".squad/config.json";
const SQUAD_UPSTREAM_RELATIVE_PATH = ".squad/upstream.json";
const SQUAD_PLUGIN_MARKETPLACES_RELATIVE_PATH = ".squad/plugins/marketplaces.json";
const SQUAD_MODEL_CONFIG_RELATIVE_PATH = ".squad/model-config.json";
const SQUAD_AGENT_RELATIVE_PATH = ".github/agents/squad.agent.md";

/** Files whose presence means the workspace has Squad state worth profiling. */
const SQUAD_PROFILE_MARKERS = [SQUAD_CONFIG_RELATIVE_PATH, ".squad/team.md", SQUAD_AGENT_RELATIVE_PATH] as const;

/** Result of applying a Squad profile section. */
export interface SquadProfileApplyOutcome {
  /** Whether the profile contained Squad data to apply. */
  applied: boolean;

  /** Backup path created before writes, or `null` when nothing existed. */
  backupPath: string | null;

  /** Workspace-root-relative files written by this service. */
  writtenFiles: string[];

  /**
   * Number of installed plugin descriptors persisted in the profile. Applying a
   * profile does not install/uninstall plugins because FR-065 only defines the
   * serialised profile contract; lifecycle writes remain explicit Squad actions.
   */
  pluginCount: number;
}

/** Minimal VS Code filesystem seam for deterministic unit tests. */
export interface SquadProfileFileSystem {
  /** Read raw bytes from a file. */
  readFile(uri: vscode.Uri): Thenable<Uint8Array>;

  /** Return file metadata or throw a VS Code-style FileNotFound error. */
  stat(uri: vscode.Uri): Thenable<vscode.FileStat>;

  /** Create a directory and any missing parents. */
  createDirectory(uri: vscode.Uri): Thenable<void>;

  /** Write raw bytes, replacing any existing file. */
  writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
}

/** Constructor options for {@link SquadProfileService}. */
export interface SquadProfileServiceOptions {
  /** Backup service for existing Squad artifacts. */
  backup: SquadArtifactBackup;

  /** Workspace-root resolver; defaults to the first open workspace folder. */
  getWorkspaceRoot?: () => vscode.Uri | undefined;

  /** Read-only file service factory. */
  createFileService?: (workspaceRoot: vscode.Uri) => SquadFileService;

  /** Read-only plugin inventory factory. */
  createPluginService?: (fileService: SquadFileService) => Pick<SquadPluginService, "readMarketplaces" | "listInstalledPlugins">;

  /** File-system seam; defaults to `vscode.workspace.fs`. */
  fileSystem?: SquadProfileFileSystem;

  /** Logger; defaults to the shared singleton. */
  logger?: LoggingService;
}

interface SquadConfigFields {
  presetId?: string;
  ralph?: SquadRalphPreferences;
}

/** Service that captures and applies the Squad section of a NexKit profile. */
export class SquadProfileService {
  private readonly _backup: SquadArtifactBackup;
  private readonly _getWorkspaceRoot: () => vscode.Uri | undefined;
  private readonly _createFileService: (workspaceRoot: vscode.Uri) => SquadFileService;
  private readonly _createPluginService?: (
    fileService: SquadFileService
  ) => Pick<SquadPluginService, "readMarketplaces" | "listInstalledPlugins">;
  private readonly _fileSystem: SquadProfileFileSystem;
  private readonly _logger: LoggingService;
  private readonly _decoder = new TextDecoder("utf-8");
  private readonly _encoder = new TextEncoder();

  constructor(options: SquadProfileServiceOptions) {
    this._backup = options.backup;
    this._getWorkspaceRoot = options.getWorkspaceRoot ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri);
    this._createFileService = options.createFileService ?? ((workspaceRoot) => new SquadFileService(workspaceRoot));
    this._createPluginService = options.createPluginService;
    this._fileSystem = options.fileSystem ?? vscode.workspace.fs;
    this._logger = options.logger ?? LoggingService.getInstance();
  }

  /**
   * Capture the current workspace's Squad profile section.
   *
   * Returns `undefined` when no Squad markers are present so existing template
   * profiles remain compact and backward-compatible.
   */
  public async captureCurrentConfig(): Promise<SquadResult<SquadProfileConfig | undefined>> {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return squadOk(undefined);
    }

    const hasSquad = await this._hasAnySquadMarker(workspaceRoot);
    if (!hasSquad) {
      return squadOk(undefined);
    }

    const configFields = await this._readConfigFields(workspaceRoot);
    if (!configFields.ok) {
      return configFields;
    }

    const fileService = this._createFileService(workspaceRoot);

    const upstreams = await fileService.readUpstreams();
    if (isSquadErr(upstreams)) {
      return upstreams;
    }

    const marketplaces = await fileService.readPluginMarketplaces();
    if (isSquadErr(marketplaces)) {
      return marketplaces;
    }

    const modelConfig = await fileService.readModelConfig();
    if (isSquadErr(modelConfig)) {
      return modelConfig;
    }
    if (modelConfig.value.validationError) {
      return squadErr(modelConfig.value.validationError);
    }

    const pluginService = this._createPluginService?.(fileService);
    let plugins: SquadPluginRef[] = [];
    if (pluginService) {
      const installedPlugins = await pluginService.listInstalledPlugins({ cwd: workspaceRoot });
      if (isSquadErr(installedPlugins)) {
        return installedPlugins;
      }
      plugins = installedPlugins.value;
    }

    return squadOk(
      this._compact({
        ...configFields.value,
        upstreams: upstreams.value,
        pluginMarketplaces: marketplaces.value,
        plugins,
        ...(modelConfig.value.document.config ? { modelConfig: modelConfig.value.document.config } : {}),
      })
    );
  }

  /**
   * Apply a profile's Squad section to the current workspace.
   *
   * Restores file-backed configuration (`.squad/config.json`,
   * `.squad/upstream.json`, `.squad/plugins/marketplaces.json` and
   * `.squad/model-config.json`) after taking a Squad artifact backup. Installed
   * plugin descriptors remain profile metadata until the user explicitly runs
   * Squad plugin lifecycle actions.
   */
  public async applyProfileConfig(config: SquadProfileConfig | undefined): Promise<SquadResult<SquadProfileApplyOutcome>> {
    if (!config || this._isEmpty(config)) {
      return squadOk({ applied: false, backupPath: null, writtenFiles: [], pluginCount: 0 });
    }

    const validationError = this._validateProfileConfig(config);
    if (validationError) {
      return squadErr(validationError);
    }

    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return squadErr({
        code: "not-a-workspace",
        message: "Cannot apply Squad profile configuration without an open workspace folder.",
        remediation: "Open the target workspace folder, then apply the profile again.",
      });
    }

    let backupPath: string | null;
    try {
      backupPath = await this._backup.backupSquadArtifacts(workspaceRoot.fsPath);
    } catch (error) {
      this._logger.error("SquadProfileService: backup failed before applying a profile", error);
      return squadErr({
        code: "backup-failed",
        message: "Could not back up existing Squad files, so the profile was not applied.",
        remediation: "Ensure the NexKit backup directory is writable and try again. Nothing was changed.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }

    const writes = this._buildWrites(config);
    const writtenFiles: string[] = [];
    for (const write of writes) {
      const result = await this._writeJson(workspaceRoot, write.relativePath, write.content);
      if (!result.ok) {
        return result;
      }
      writtenFiles.push(write.relativePath);
    }

    return squadOk({
      applied: true,
      backupPath,
      writtenFiles,
      pluginCount: config.plugins?.length ?? 0,
    });
  }

  private async _readConfigFields(workspaceRoot: vscode.Uri): Promise<SquadResult<SquadConfigFields>> {
    const uri = this._joinRelative(workspaceRoot, SQUAD_CONFIG_RELATIVE_PATH);
    let raw: string;
    try {
      raw = this._decoder.decode(await this._fileSystem.readFile(uri));
    } catch (error) {
      if (this._isNotFound(error)) {
        return squadOk({});
      }
      return this._readError(SQUAD_CONFIG_RELATIVE_PATH, error);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return squadErr({
        code: "parse-failed",
        message: "The Squad profile configuration could not be captured because .squad/config.json is not valid JSON.",
        remediation: "Fix .squad/config.json, then save the NexKit profile again.",
        detail: SQUAD_CONFIG_RELATIVE_PATH,
        cause: error,
      });
    }
    if (!this._isRecord(parsed)) {
      return squadErr({
        code: "parse-failed",
        message: "The Squad profile configuration could not be captured because .squad/config.json has an unsupported shape.",
        remediation: "Use a JSON object for .squad/config.json, then save the NexKit profile again.",
        detail: SQUAD_CONFIG_RELATIVE_PATH,
      });
    }

    return squadOk({
      presetId: this._readPresetId(parsed),
      ralph: this._readRalphPreferences(parsed),
    });
  }

  private _buildWrites(config: SquadProfileConfig): { relativePath: string; content: string }[] {
    const writes: { relativePath: string; content: string }[] = [];

    const configDocument: Record<string, unknown> = {};
    if (config.presetId) {
      configDocument.presetId = config.presetId;
    }
    if (config.ralph) {
      if (config.ralph.backlogPlatform) {
        configDocument.platform = config.ralph.backlogPlatform;
      }
      if (config.ralph.autoStartWatch !== undefined) {
        configDocument.ralph = { autoStartWatch: config.ralph.autoStartWatch };
      }
    }
    if (Object.keys(configDocument).length > 0) {
      writes.push({ relativePath: SQUAD_CONFIG_RELATIVE_PATH, content: this._formatJson(configDocument) });
    }

    if (config.upstreams !== undefined) {
      writes.push({
        relativePath: SQUAD_UPSTREAM_RELATIVE_PATH,
        content: this._formatJson({ upstreams: config.upstreams }),
      });
    }

    if (config.pluginMarketplaces !== undefined) {
      writes.push({
        relativePath: SQUAD_PLUGIN_MARKETPLACES_RELATIVE_PATH,
        content: this._formatJson({ marketplaces: config.pluginMarketplaces }),
      });
    }

    if (config.modelConfig !== undefined) {
      writes.push({
        relativePath: SQUAD_MODEL_CONFIG_RELATIVE_PATH,
        content: serializeSquadModelConfig(config.modelConfig),
      });
    }

    return writes;
  }

  private async _writeJson(workspaceRoot: vscode.Uri, relativePath: string, content: string): Promise<SquadResult<void>> {
    const uri = this._joinRelative(workspaceRoot, relativePath);
    try {
      await this._fileSystem.createDirectory(this._parentUri(uri));
      await this._fileSystem.writeFile(uri, this._encoder.encode(content));
      return squadOk(undefined);
    } catch (error) {
      this._logger.error(`SquadProfileService: failed to write ${relativePath}`, error);
      return squadErr({
        code: "file-write-failed",
        message: `Could not apply the Squad profile configuration to ${relativePath}.`,
        remediation: "Check workspace file permissions, then apply the profile again.",
        detail: relativePath,
        cause: error,
      });
    }
  }

  private _compact(config: SquadProfileConfig): SquadProfileConfig {
    const compact: SquadProfileConfig = {};
    if (config.presetId) {
      compact.presetId = config.presetId;
    }
    if (config.upstreams !== undefined) {
      compact.upstreams = config.upstreams;
    }
    if (config.pluginMarketplaces !== undefined) {
      compact.pluginMarketplaces = config.pluginMarketplaces;
    }
    if (config.plugins !== undefined) {
      compact.plugins = config.plugins;
    }
    if (config.modelConfig !== undefined) {
      compact.modelConfig = config.modelConfig;
    }
    if (config.ralph && Object.keys(config.ralph).length > 0) {
      compact.ralph = config.ralph;
    }
    return compact;
  }

  private _validateProfileConfig(config: SquadProfileConfig): import("../models").SquadError | undefined {
    if (config.presetId !== undefined && typeof config.presetId !== "string") {
      return this._invalidProfile("squad.presetId must be a string.");
    }
    if (config.upstreams !== undefined && !Array.isArray(config.upstreams)) {
      return this._invalidProfile("squad.upstreams must be an array.");
    }
    if (config.pluginMarketplaces !== undefined && !Array.isArray(config.pluginMarketplaces)) {
      return this._invalidProfile("squad.pluginMarketplaces must be an array.");
    }
    if (config.plugins !== undefined && !Array.isArray(config.plugins)) {
      return this._invalidProfile("squad.plugins must be an array.");
    }
    if (config.modelConfig !== undefined) {
      if (!this._isRecord(config.modelConfig) || !Array.isArray(config.modelConfig.overrides)) {
        return this._invalidProfile("squad.modelConfig must contain an overrides array.");
      }
    }
    if (config.ralph !== undefined && !this._isRecord(config.ralph)) {
      return this._invalidProfile("squad.ralph must be an object.");
    }
    return undefined;
  }

  private _invalidProfile(detail: string): import("../models").SquadError {
    return {
      code: "invalid-input",
      message: "The saved profile contains an invalid Squad configuration.",
      remediation: "Delete and recreate the profile, or fix the profile entry in the NexKit settings.",
      detail,
    };
  }

  private async _hasAnySquadMarker(workspaceRoot: vscode.Uri): Promise<boolean> {
    for (const relativePath of SQUAD_PROFILE_MARKERS) {
      try {
        await this._fileSystem.stat(this._joinRelative(workspaceRoot, relativePath));
        return true;
      } catch (error) {
        if (!this._isNotFound(error)) {
          this._logger.warn("SquadProfileService: failed to inspect Squad marker", error);
        }
      }
    }
    return false;
  }

  private _readPresetId(config: Record<string, unknown>): string | undefined {
    return (
      this._asString(config.presetId) ??
      this._asString(config.preset) ??
      this._asString(config.selectedPreset) ??
      (this._isRecord(config.squad) ? (this._asString(config.squad.presetId) ?? this._asString(config.squad.preset)) : undefined)
    );
  }

  private _readRalphPreferences(config: Record<string, unknown>): SquadRalphPreferences | undefined {
    const ralph = this._isRecord(config.ralph) ? config.ralph : {};
    const backlog = this._isRecord(config.backlog) ? config.backlog : {};
    const watch = this._isRecord(config.watch) ? config.watch : {};
    const preferences: SquadRalphPreferences = {};

    const autoStartWatch =
      this._asBoolean(ralph.autoStartWatch) ??
      this._asBoolean(ralph.autoStart) ??
      this._asBoolean(config.autoStartWatch) ??
      this._asBoolean(watch.autoStart);
    if (autoStartWatch !== undefined) {
      preferences.autoStartWatch = autoStartWatch;
    }

    const backlogPlatform =
      this._asString(config.platform) ?? this._asString(config.backlogPlatform) ?? this._asString(backlog.platform);
    if (backlogPlatform !== undefined) {
      preferences.backlogPlatform = backlogPlatform;
    }

    return Object.keys(preferences).length > 0 ? preferences : undefined;
  }

  private _isEmpty(config: SquadProfileConfig): boolean {
    return Object.keys(config).length === 0;
  }

  private _formatJson(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  private _joinRelative(workspaceRoot: vscode.Uri, relativePath: string): vscode.Uri {
    return vscode.Uri.joinPath(workspaceRoot, ...relativePath.split("/"));
  }

  private _parentUri(uri: vscode.Uri): vscode.Uri {
    const segments = uri.path.split("/");
    segments.pop();
    return uri.with({ path: segments.join("/") || "/" });
  }

  private _readError(relativePath: string, error: unknown): SquadResult<never> {
    this._logger.error(`SquadProfileService: failed to read ${relativePath}`, error);
    return squadErr({
      code: "file-read-failed",
      message: `Could not read ${relativePath} for the Squad profile.`,
      remediation: "Check file permissions, then save the profile again.",
      detail: relativePath,
      cause: error,
    });
  }

  private _isNotFound(error: unknown): boolean {
    if (error instanceof vscode.FileSystemError) {
      return error.code === "FileNotFound";
    }
    return this._isRecord(error) && error.code === "FileNotFound";
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private _asString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private _asBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
  }
}
