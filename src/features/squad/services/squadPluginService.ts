/**
 * Read-only Squad plugin inventory service (SQD-038).
 *
 * Covers PRD FR-042 by delegating marketplace reads to {@link SquadFileService}
 * and FR-043 by using the allowlisted Squad CLI wrapper for
 * `squad plugin list --json`. This service does not mutate plugin state; write
 * actions are intentionally left to the lifecycle service in #254.
 */

import type * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  SquadPluginRef,
  SquadPluginStatus,
  SquadResult,
  squadErr,
  squadOk,
} from "../models";
import { SquadCliCommand, SquadCliService } from "./squadCliService";
import { SquadFileService } from "./squadFileService";

/** Constructor options for {@link SquadPluginService}. */
export interface SquadPluginServiceOptions {
  /** Read-only file layer bound to the current workspace root. */
  fileService: SquadFileService;

  /** Safe, allowlisted Squad CLI wrapper. */
  cli: SquadCliService;

  /** Logger. Defaults to the shared {@link LoggingService} singleton. */
  logger?: LoggingService;
}

/** Options for listing installed plugins through the Squad CLI. */
export interface SquadPluginListOptions {
  /** Working directory for `squad plugin list --json`. */
  cwd?: vscode.Uri;

  /** Cancellation token for the CLI call. */
  token?: vscode.CancellationToken;
}

/**
 * Read-only plugin inventory facade shared by the panel host and future plugin
 * lifecycle actions (#254).
 */
export class SquadPluginService {
  private readonly _fileService: SquadFileService;
  private readonly _cli: SquadCliService;
  private readonly _logger: LoggingService;

  constructor(options: SquadPluginServiceOptions) {
    this._fileService = options.fileService;
    this._cli = options.cli;
    this._logger = options.logger ?? LoggingService.getInstance();
  }

  /** Read Squad plugin marketplaces from `.squad/plugins/marketplaces.json` (FR-042). */
  public readMarketplaces(): ReturnType<SquadFileService["readPluginMarketplaces"]> {
    return this._fileService.readPluginMarketplaces();
  }

  /**
   * List installed Squad plugins via `squad plugin list --json` (FR-043).
   * Any CLI or parse failure is returned as an actionable failure instead of an
   * empty success, so the panel can show the problem explicitly.
   */
  public async listInstalledPlugins(
    options: SquadPluginListOptions = {}
  ): Promise<SquadResult<SquadPluginRef[]>> {
    const result = await this._cli.execute(SquadCliCommand.Plugin, {
      args: ["list", "--json"],
      cwd: options.cwd,
      token: options.token,
    });

    if (!result.ok) {
      this._logger.warn("Squad plugins: plugin list failed", result.error);
      return squadErr({
        code: result.error.code === "cli-not-found" ? "cli-not-found" : "plugin-list-failed",
        message:
          result.error.code === "cli-not-found"
            ? "The Squad CLI could not be found, so installed plugins could not be listed."
            : "Installed Squad plugins could not be listed.",
        remediation:
          result.error.code === "cli-not-found"
            ? result.error.remediation
            : "Run `squad plugin list --json` in a terminal, resolve the reported issue, then refresh the Squad tab.",
        detail: result.error.detail ?? result.error.code,
        cause: result.error.cause,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.value.stdout);
    } catch (error) {
      return squadErr({
        code: "plugin-list-failed",
        message: "The Squad plugin list output was not valid JSON.",
        remediation:
          "Update the Squad CLI or run `squad plugin list --json` manually to inspect the output.",
        cause: error,
      });
    }

    return squadOk(this._normalizePlugins(parsed));
  }

  private _normalizePlugins(parsed: unknown): SquadPluginRef[] {
    const list =
      Array.isArray(parsed)
        ? parsed
        : this._isRecord(parsed) && Array.isArray(parsed.plugins)
          ? parsed.plugins
          : this._isRecord(parsed) && Array.isArray(parsed.items)
            ? parsed.items
            : this._isRecord(parsed) && Array.isArray(parsed.installed)
              ? parsed.installed
              : [];

    const plugins: SquadPluginRef[] = [];
    for (const entry of list) {
      if (typeof entry === "string") {
        const id = entry.trim();
        if (id.length > 0) {
          plugins.push({ id, enabled: true, status: SquadPluginStatus.Unknown });
        }
        continue;
      }
      if (!this._isRecord(entry)) {
        continue;
      }
      const plugin = this._pluginFromRecord(entry);
      if (plugin) {
        plugins.push(plugin);
      }
    }
    return plugins;
  }

  private _pluginFromRecord(entry: Record<string, unknown>): SquadPluginRef | undefined {
    const id =
      this._asString(entry.id) ??
      this._asString(entry.pluginId) ??
      this._asString(entry.name) ??
      this._asString(entry.package);
    if (id === undefined) {
      return undefined;
    }

    const status = this._toPluginStatus(entry.status ?? entry.state, entry.enabled, entry.disabled);
    const plugin: SquadPluginRef = {
      id,
      displayName: this._displayName(entry, id),
      marketplace:
        this._asString(entry.marketplace) ??
        this._asString(entry.marketplaceId) ??
        this._asString(entry.source),
      enabled: status !== SquadPluginStatus.Disabled,
      status,
      version: this._asString(entry.version),
      description: this._asString(entry.description),
    };
    return plugin;
  }

  private _displayName(entry: Record<string, unknown>, id: string): string | undefined {
    const displayName = this._asString(entry.displayName) ?? this._asString(entry.title) ?? this._asString(entry.name);
    return displayName !== id ? displayName : undefined;
  }

  private _toPluginStatus(status: unknown, enabled: unknown, disabled: unknown): SquadPluginStatus {
    if (typeof disabled === "boolean" && disabled) {
      return SquadPluginStatus.Disabled;
    }
    if (typeof enabled === "boolean") {
      return enabled ? SquadPluginStatus.Enabled : SquadPluginStatus.Disabled;
    }
    switch (this._asString(status)?.toLowerCase()) {
      case SquadPluginStatus.Enabled:
      case "active":
        return SquadPluginStatus.Enabled;
      case SquadPluginStatus.Disabled:
      case "inactive":
        return SquadPluginStatus.Disabled;
      default:
        return SquadPluginStatus.Unknown;
    }
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private _asString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }
}
