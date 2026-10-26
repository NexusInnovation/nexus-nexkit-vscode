import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { MarketplaceSuggestion, NEXUS_PLUGIN_MARKETPLACE, SUGGESTED_MARKETPLACES } from "./models/marketplace";

const SETTING_ID = "chat.plugins.marketplaces";
const GITHUB_SHORTHAND = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]+(?:#[^\s#]+)?$/;
const GITHUB_URL = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i;
const GIT_URI = /^(?:https?:\/\/|ssh:\/\/|git@)\S+$/i;

/**
 * Manages the user-level `chat.plugins.marketplaces` list that VS Code uses to
 * discover Agent Plugins (the Nexus marketplace and any other source).
 */
export class MarketplaceService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  private readonly _configurationListener: vscode.Disposable;

  /** Fires when the marketplace list changes, including edits made in settings.json. */
  public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  constructor() {
    this._configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SETTING_ID)) {
        this._onDidChange.fire();
      }
    });
  }

  public getConfigured(): string[] {
    return SettingsManager.getPluginMarketplaces();
  }

  public getSuggestions(): MarketplaceSuggestion[] {
    const configuredKeys = new Set(this.getConfigured().map((entry) => MarketplaceService.keyOf(entry)));
    return SUGGESTED_MARKETPLACES.map((suggestion) => ({
      ...suggestion,
      isConfigured: configuredKeys.has(MarketplaceService.keyOf(suggestion.source)),
    }));
  }

  /**
   * Add a marketplace (GitHub `owner/repo[#ref]`, GitHub URL or git URI).
   * The Nexus marketplace is kept first, mirroring the settings deployer.
   * @throws Error when the input is not a valid marketplace source.
   */
  public async add(input: string): Promise<string[]> {
    const source = MarketplaceService.normalizeSource(input);
    if (!source) {
      throw new Error("Enter a GitHub repository as owner/repo (optionally owner/repo#branch), or a git URL.");
    }

    const current = this.getConfigured();
    const key = MarketplaceService.keyOf(source);
    if (current.some((entry) => MarketplaceService.keyOf(entry) === key)) {
      return current;
    }

    const updated = key === MarketplaceService.keyOf(NEXUS_PLUGIN_MARKETPLACE) ? [source, ...current] : [...current, source];
    await SettingsManager.setPluginMarketplaces(updated);
    return updated;
  }

  public async remove(source: string): Promise<string[]> {
    const key = MarketplaceService.keyOf(source);
    const current = this.getConfigured();
    const updated = current.filter((entry) => MarketplaceService.keyOf(entry) !== key);
    if (updated.length !== current.length) {
      await SettingsManager.setPluginMarketplaces(updated);
    }
    return updated;
  }

  /**
   * Returns the canonical value to store, or `undefined` when the input is not a supported source.
   */
  public static normalizeSource(input: string): string | undefined {
    const value = input.trim();
    if (!value) {
      return undefined;
    }

    const urlMatch = GITHUB_URL.exec(value);
    if (urlMatch) {
      return `${urlMatch[1]}/${urlMatch[2]}`;
    }
    if (GITHUB_SHORTHAND.test(value)) {
      return value;
    }
    return GIT_URI.test(value) ? value : undefined;
  }

  /**
   * Stable identity of a marketplace: source without `#ref`, case-insensitive.
   */
  public static keyOf(source: string): string {
    return source.split("#")[0].trim().toLowerCase();
  }

  public dispose(): void {
    this._configurationListener.dispose();
    this._onDidChange.dispose();
  }
}
