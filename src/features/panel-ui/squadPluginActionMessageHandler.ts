import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { LoggingService } from "../../shared/services/loggingService";
import {
  SquadError,
  SquadPluginAction,
  SquadPluginActionTargetKind,
  isSquadErr,
} from "../squad/models";
import { SquadPluginActionService } from "../squad/services/squadPluginActionService";
import { ExtensionMessage, WebviewMessage } from "./types/webviewMessages";

/** Prompts used when the webview did not supply an action operand. Injectable for tests. */
export interface SquadPluginActionPrompts {
  /** Ask for a marketplace repository (`owner/repo`); `undefined` when dismissed. */
  askMarketplaceSource(): Promise<string | undefined>;

  /** Pick a local plugin directory; `undefined` when dismissed. */
  pickPluginDirectory(): Promise<string | undefined>;
}

/** VS Code-backed prompts used in production. */
export function createVscodeSquadPluginActionPrompts(): SquadPluginActionPrompts {
  return {
    askMarketplaceSource: async (): Promise<string | undefined> =>
      vscode.window.showInputBox({
        title: "Register a Squad plugin marketplace",
        prompt: "GitHub repository of the marketplace (owner/repo)",
        placeHolder: "owner/repo",
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim().includes("/") ? undefined : "Use the form owner/repo."),
      }),
    pickPluginDirectory: async (): Promise<string | undefined> => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select plugin folder",
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      });
      return picked?.[0]?.fsPath;
    },
  };
}

/**
 * Routes `runSquadPluginAction` (SQD-039 / #254, PRD FR-040/FR-041/FR-044) to
 * {@link SquadPluginActionService}.
 *
 * Every request ends with exactly one `squadPluginActionResult`. Failures other
 * than a user cancellation are also emitted as `squadError` so they stay
 * visible in the Squad tab; successful write actions re-read the plugin
 * inventory and post `squadPluginsUpdate`.
 */
export class SquadPluginActionMessageHandler {
  private readonly _logger: LoggingService;
  private readonly _prompts: SquadPluginActionPrompts;

  constructor(
    private readonly _services: ServiceContainer,
    private readonly _postMessage: (message: ExtensionMessage) => void,
    prompts?: SquadPluginActionPrompts
  ) {
    this._logger = _services.logging;
    this._prompts = prompts ?? createVscodeSquadPluginActionPrompts();
  }

  /** Returns `true` when the message was a plugin action handled here. */
  public async handle(message: WebviewMessage): Promise<boolean> {
    if (message.command !== "runSquadPluginAction") {
      return false;
    }
    await this._handleRunAction(message.action, message.target);
    return true;
  }

  private async _handleRunAction(action: SquadPluginAction, requestedTarget: string | undefined): Promise<void> {
    const service = this._services.squadPluginActions;
    if (!service) {
      this._fail(action, requestedTarget, {
        code: "not-a-workspace",
        message: "Squad plugin actions need an open workspace folder.",
        remediation: "Open the folder that contains your Squad, then try again.",
      });
      return;
    }

    const target = await this._resolveTarget(action, requestedTarget);
    if (target === null) {
      this._postMessage({
        command: "squadPluginActionResult",
        action,
        ok: false,
        error: {
          code: "cancelled",
          message: "The plugin action was cancelled.",
          remediation: "Run the action again when you are ready. Nothing was changed.",
        },
      });
      return;
    }

    this._setLoading(true);
    try {
      const result = await service.runAction({ action, target });
      if (isSquadErr(result)) {
        this._fail(action, target, result.error);
        return;
      }

      this._postMessage({
        command: "squadPluginActionResult",
        action,
        target: result.value.target,
        ok: true,
        changed: result.value.changed,
        output: result.value.output,
      });

      if (result.value.changed) {
        await this._refreshInventory();
      }
    } catch (error) {
      this._logger.error("Squad plugins: unexpected failure running a plugin action", error);
      this._fail(action, target, {
        code: "plugin-action-failed",
        message: "The Squad plugin action failed unexpectedly.",
        remediation: "Check the Nexkit output channel for details and try again.",
        cause: error,
      });
    } finally {
      this._setLoading(false);
    }
  }

  /**
   * Prompt for a missing operand when the action supports it. Returns `null`
   * when the user dismissed the prompt, otherwise the (possibly undefined) target.
   */
  private async _resolveTarget(action: SquadPluginAction, target: string | undefined): Promise<string | undefined | null> {
    if (target !== undefined && target.trim().length > 0) {
      return target;
    }
    const descriptor = SquadPluginActionService.describe(action);
    switch (descriptor?.targetKind) {
      case SquadPluginActionTargetKind.MarketplaceSource:
        return (await this._prompts.askMarketplaceSource()) ?? null;
      case SquadPluginActionTargetKind.PluginDirectory:
        return (await this._prompts.pickPluginDirectory()) ?? null;
      default:
        return target;
    }
  }

  private async _refreshInventory(): Promise<void> {
    const plugins = this._services.squadPlugins;
    if (!plugins) {
      return;
    }
    const marketplaces = await plugins.readMarketplaces();
    const installed = await plugins.listInstalledPlugins({ cwd: vscode.workspace.workspaceFolders?.[0]?.uri });
    this._postMessage({
      command: "squadPluginsUpdate",
      marketplaces: isSquadErr(marketplaces) ? [] : marketplaces.value,
      plugins: isSquadErr(installed) ? [] : installed.value,
    });
    const error = isSquadErr(marketplaces) ? marketplaces.error : isSquadErr(installed) ? installed.error : undefined;
    if (error) {
      this._postMessage({ command: "squadError", error });
    }
  }

  private _fail(action: SquadPluginAction, target: string | undefined, error: SquadError): void {
    this._postMessage({
      command: "squadPluginActionResult",
      action,
      ...(target ? { target } : {}),
      ok: false,
      error,
    });
    if (error.code !== "cancelled") {
      this._postMessage({ command: "squadError", error });
    }
  }

  private _setLoading(isLoading: boolean): void {
    this._postMessage({ command: "squadLoading", isLoading });
  }
}
