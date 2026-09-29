/**
 * SquadPluginActionService (SQD-039) — plugin marketplace and lifecycle
 * actions orchestrated through the allowlisted Squad CLI.
 *
 * Covers PRD FR-040 (pre-register the Nexus marketplace on request), FR-041
 * (register any marketplace with `squad plugin marketplace add`) and FR-044
 * (validate / dry-run / install / enable / disable / uninstall / refresh).
 *
 * Flow for every action:
 *  1. Resolve the workspace root (`not-a-workspace` when none is open).
 *  2. Validate and normalise the operand before anything is spawned.
 *  3. For marketplace add/remove, pre-check `.squad/plugins/marketplaces.json`
 *     through {@link SquadPluginService} so a malformed manifest is never
 *     silently overwritten by the CLI and no-ops skip the write entirely.
 *  4. Write actions require explicit confirmation, then back up the Squad
 *     artifacts via BackupService; a declined confirmation or a failed backup
 *     aborts before the CLI runs.
 *  5. Run `squad plugin …` through {@link SquadCliService}; failures are
 *     re-mapped to an actionable `plugin-action-failed` error and never reported
 *     as success.
 */

import * as vscode from "vscode";
import { LoggingService } from "../../../shared/services/loggingService";
import {
  NEXUS_SQUAD_MARKETPLACE_REPO,
  SQUAD_PLUGIN_ACTIONS,
  SquadError,
  SquadPluginAction,
  SquadPluginActionDescriptor,
  SquadPluginActionOutcome,
  SquadPluginActionRequest,
  SquadPluginActionTargetKind,
  SquadResult,
  isSquadErr,
  squadErr,
  squadOk,
} from "../models";
import { SquadCliCommand, SquadCliService } from "./squadCliService";
import type { SquadArtifactBackup } from "./squadInitService";
import { SquadPluginActionConfirmer, VscodeSquadPluginActionConfirmer } from "./squadPluginActionConfirmer";
import { SquadPluginService } from "./squadPluginService";

const MARKETPLACE_SOURCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;
const MARKETPLACE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const PLUGIN_ID_PATTERN = /^[A-Za-z0-9@][A-Za-z0-9._@/-]*$/;
const MAX_OPERAND_LENGTH = 512;
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Constructor dependencies; seams are injectable for unit tests. */
export interface SquadPluginActionServiceOptions {
  /** Allowlisted Squad CLI wrapper. */
  cli: SquadCliService;

  /** Read-only plugin inventory (SQD-038), used for marketplace pre-checks. */
  plugins: SquadPluginService;

  /** Backup service for Squad artifacts (reuses BackupService in production). */
  backup: SquadArtifactBackup;

  /** Confirmation dialog seam; defaults to a VS Code modal. */
  confirmer?: SquadPluginActionConfirmer;

  /** Logger; defaults to the shared {@link LoggingService} singleton. */
  logger?: LoggingService;

  /** Workspace-root resolver; defaults to the first open workspace folder. */
  getWorkspaceRoot?: () => vscode.Uri | undefined;
}

/** Per-call options. */
export interface SquadPluginActionRunOptions {
  /** Cancellation token forwarded to the CLI. */
  token?: vscode.CancellationToken;
}

/** Runs Squad plugin marketplace and lifecycle actions. */
export class SquadPluginActionService {
  private readonly _cli: SquadCliService;
  private readonly _plugins: SquadPluginService;
  private readonly _backup: SquadArtifactBackup;
  private readonly _confirmer: SquadPluginActionConfirmer;
  private readonly _logger: LoggingService;
  private readonly _getWorkspaceRoot: () => vscode.Uri | undefined;

  constructor(options: SquadPluginActionServiceOptions) {
    this._cli = options.cli;
    this._plugins = options.plugins;
    this._backup = options.backup;
    this._confirmer = options.confirmer ?? new VscodeSquadPluginActionConfirmer();
    this._logger = options.logger ?? LoggingService.getInstance();
    this._getWorkspaceRoot = options.getWorkspaceRoot ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri);
  }

  /** Descriptor for an action, or `undefined` when the action is unknown. */
  public static describe(action: string): SquadPluginActionDescriptor | undefined {
    return Object.prototype.hasOwnProperty.call(SQUAD_PLUGIN_ACTIONS, action)
      ? SQUAD_PLUGIN_ACTIONS[action as SquadPluginAction]
      : undefined;
  }

  /**
   * Run a plugin action. The failure branch always carries an actionable
   * {@link SquadError}, including `cancelled` when the user declines.
   */
  public async runAction(
    request: SquadPluginActionRequest,
    options: SquadPluginActionRunOptions = {}
  ): Promise<SquadResult<SquadPluginActionOutcome>> {
    const descriptor = SquadPluginActionService.describe(request.action);
    if (!descriptor) {
      return squadErr({
        code: "plugin-action-failed",
        message: `Unknown Squad plugin action: ${String(request.action)}.`,
        remediation: "Use one of the supported plugin actions.",
      });
    }

    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      return squadErr({
        code: "not-a-workspace",
        message: `Cannot ${descriptor.label.toLowerCase()} without an open workspace folder.`,
        remediation: "Open the folder that contains your Squad, then try again.",
      });
    }

    const targetResult = this._resolveTarget(descriptor, request.target);
    if (isSquadErr(targetResult)) {
      return targetResult;
    }
    const target = targetResult.value;

    const precheck = await this._precheck(descriptor, target);
    if (isSquadErr(precheck)) {
      return precheck;
    }
    if (precheck.value) {
      return squadOk(precheck.value);
    }

    const args = this._buildArgs(descriptor.action, target);
    let backedUp = false;

    if (descriptor.writes) {
      const confirmed = await this._confirmer.confirm({
        descriptor,
        target,
        commandPreview: ["squad", "plugin", ...args].join(" "),
      });
      if (!confirmed) {
        return squadErr({
          code: "cancelled",
          message: `${descriptor.label} was cancelled.`,
          remediation: "Run the action again when you are ready to proceed. Nothing was changed.",
        });
      }

      try {
        backedUp = (await this._backup.backupSquadArtifacts(workspaceRoot.fsPath)) !== null;
      } catch (error) {
        this._logger.error("Squad plugins: backup failed, aborting before running the action", error);
        return squadErr({
          code: "backup-failed",
          message: `Could not back up your Squad files, so "${descriptor.label}" was aborted.`,
          remediation:
            "Ensure the backup location is writable and you have free disk space, then try again. Nothing was changed.",
          detail: error instanceof Error ? error.message : String(error),
          cause: error,
        });
      }
    }

    const result = await this._cli.execute(SquadCliCommand.Plugin, {
      args,
      cwd: workspaceRoot,
      token: options.token,
    });

    if (isSquadErr(result)) {
      this._logger.warn(`Squad plugins: action "${descriptor.action}" failed`, result.error);
      return squadErr(this._mapCliError(descriptor, target, result.error, backedUp));
    }

    this._logger.info(`Squad plugins: action "${descriptor.action}" succeeded`);
    return squadOk({
      action: descriptor.action,
      target,
      changed: descriptor.writes,
      backedUp,
      output: this._cleanOutput(result.value.stdout),
    });
  }

  /** Validate and normalise the operand for the action. */
  private _resolveTarget(descriptor: SquadPluginActionDescriptor, rawTarget: string | undefined): SquadResult<string> {
    if (descriptor.targetKind === SquadPluginActionTargetKind.None) {
      return squadOk(descriptor.action === SquadPluginAction.AddNexusMarketplace ? NEXUS_SQUAD_MARKETPLACE_REPO : "");
    }

    const target = (rawTarget ?? "").trim();
    if (target.length === 0) {
      return this._invalidTarget(descriptor, "A value is required.");
    }
    if (target.length > MAX_OPERAND_LENGTH || /[\0\r\n]/.test(target)) {
      return this._invalidTarget(descriptor, "The value is too long or contains control characters.");
    }
    if (target.startsWith("-")) {
      return this._invalidTarget(descriptor, "The value must not start with '-'.");
    }

    switch (descriptor.targetKind) {
      case SquadPluginActionTargetKind.MarketplaceSource: {
        const source = this._normalizeMarketplaceSource(target);
        return MARKETPLACE_SOURCE_PATTERN.test(source)
          ? squadOk(source)
          : this._invalidTarget(
              descriptor,
              "Use a GitHub repository in the form `owner/repo` (or its https://github.com URL)."
            );
      }
      case SquadPluginActionTargetKind.MarketplaceName:
        return MARKETPLACE_NAME_PATTERN.test(target)
          ? squadOk(target)
          : this._invalidTarget(descriptor, "Use the marketplace name shown in the marketplace list.");
      case SquadPluginActionTargetKind.PluginId:
        return PLUGIN_ID_PATTERN.test(target)
          ? squadOk(target)
          : this._invalidTarget(descriptor, "Use the plugin id shown in the installed plugin list.");
      case SquadPluginActionTargetKind.PluginDirectory:
      default:
        return squadOk(target);
    }
  }

  /**
   * Marketplace pre-checks. Returns an outcome when the action is a no-op
   * (already registered), `undefined` to continue, or an error.
   */
  private async _precheck(
    descriptor: SquadPluginActionDescriptor,
    target: string
  ): Promise<SquadResult<SquadPluginActionOutcome | undefined>> {
    const isAdd =
      descriptor.action === SquadPluginAction.AddMarketplace ||
      descriptor.action === SquadPluginAction.AddNexusMarketplace;
    const isRemove = descriptor.action === SquadPluginAction.RemoveMarketplace;
    if (!isAdd && !isRemove) {
      return squadOk(undefined);
    }

    const marketplaces = await this._plugins.readMarketplaces();
    if (isSquadErr(marketplaces)) {
      return squadErr({
        ...marketplaces.error,
        remediation: `${marketplaces.error.remediation ?? "Fix .squad/plugins/marketplaces.json."} NexKit did not change the marketplaces so the existing file is not overwritten.`,
      });
    }

    if (isAdd) {
      const existing = marketplaces.value.find((m) => m.source.toLowerCase() === target.toLowerCase());
      if (existing) {
        return squadOk({
          action: descriptor.action,
          target,
          changed: false,
          backedUp: false,
          output: `${target} is already registered as "${existing.id}".`,
        });
      }
      return squadOk(undefined);
    }

    if (!marketplaces.value.some((m) => m.id === target)) {
      return squadErr({
        code: "plugin-action-failed",
        message: `The marketplace "${target}" is not registered.`,
        remediation: "Refresh the plugin list and choose a registered marketplace.",
      });
    }
    return squadOk(undefined);
  }

  /** Build the `squad plugin` argument vector for an action. */
  private _buildArgs(action: SquadPluginAction, target: string): string[] {
    switch (action) {
      case SquadPluginAction.AddNexusMarketplace:
      case SquadPluginAction.AddMarketplace:
        return ["marketplace", "add", target];
      case SquadPluginAction.RemoveMarketplace:
        return ["marketplace", "remove", target];
      default:
        return [action, target];
    }
  }

  private _mapCliError(
    descriptor: SquadPluginActionDescriptor,
    target: string,
    error: SquadError,
    backedUp: boolean
  ): SquadError {
    const backupNote = backedUp
      ? " A backup of your Squad files was taken before the action; restore it from the NexKit backups if needed."
      : "";
    if (error.code !== "cli-execution-failed") {
      return backupNote ? { ...error, remediation: `${error.remediation ?? ""}${backupNote}`.trim() } : error;
    }
    return {
      code: "plugin-action-failed",
      message: `${descriptor.label} failed${target ? ` for "${target}"` : ""}.`,
      remediation: `${error.message} Resolve the reported issue and retry.${backupNote}`,
      detail: error.detail,
      cause: error.cause,
    };
  }

  private _normalizeMarketplaceSource(target: string): string {
    return target
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "");
  }

  private _invalidTarget(descriptor: SquadPluginActionDescriptor, remediation: string): SquadResult<never> {
    return squadErr({
      code: "plugin-action-failed",
      message: `Invalid input for "${descriptor.label}".`,
      remediation,
    });
  }

  private _cleanOutput(stdout: string): string {
    return stdout.replace(ANSI_ESCAPE_PATTERN, "").trim();
  }
}
