import * as path from "path";
import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { MarketplaceNode, MarketplaceSuggestion, NEXUS_PLUGIN_MARKETPLACE, SUGGESTED_MARKETPLACES } from "./models/marketplace";
import { MarketplacePluginReader } from "./marketplacePluginReader";
import { InstalledPluginsStore } from "./installedPluginsStore";
import { VsCodePluginEnablementReader } from "./vsCodePluginEnablementReader";

const SETTING_ID = "chat.plugins.marketplaces";
const LOCATIONS_SETTING_ID = "chat.pluginLocations";
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
  private readonly _installedWatcher: vscode.FileSystemWatcher;
  private readonly _installed: InstalledPluginsStore;
  private readonly _stateWatcher: vscode.FileSystemWatcher | undefined;
  private _stateDebounce: ReturnType<typeof setTimeout> | undefined;
  private _lastDisabledSignature: string | undefined;
  private _writeQueue: Promise<void> = Promise.resolve();

  /** Fires when the marketplace list changes, including edits made in settings.json. */
  public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  constructor(
    private readonly _reader: MarketplacePluginReader = new MarketplacePluginReader(),
    private readonly _vsCodeEnablement: VsCodePluginEnablementReader = new VsCodePluginEnablementReader(undefined)
  ) {
    this._configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SETTING_ID) || event.affectsConfiguration(LOCATIONS_SETTING_ID)) {
        this._onDidChange.fire();
      }
    });

    this._installed = new InstalledPluginsStore(_reader.agentPluginsRoot);
    this._installedWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(_reader.agentPluginsRoot), "installed.json")
    );
    const fire = () => this._onDidChange.fire();
    this._installedWatcher.onDidChange(fire);
    this._installedWatcher.onDidCreate(fire);
    this._installedWatcher.onDidDelete(fire);

    // VS Code's profile switch lives in state.vscdb, which changes often: only refresh when the disabled set changes.
    const stateDbPath = _vsCodeEnablement.stateDbPath;
    if (stateDbPath) {
      this._lastDisabledSignature = this.disabledSignature();
      this._stateWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(path.dirname(stateDbPath)), path.basename(stateDbPath) + "*")
      );
      const onStateChange = () => {
        clearTimeout(this._stateDebounce);
        this._stateDebounce = setTimeout(() => {
          const signature = this.disabledSignature();
          if (signature !== this._lastDisabledSignature) {
            this._lastDisabledSignature = signature;
            this._onDidChange.fire();
          }
        }, 750);
      };
      this._stateWatcher.onDidChange(onStateChange);
      this._stateWatcher.onDidCreate(onStateChange);
    }
  }

  private disabledSignature(): string | undefined {
    const disabled = this._vsCodeEnablement.getDisabledKeys();
    return disabled ? [...disabled].sort().join("|") : undefined;
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
   * Builds the marketplace → plugins tree from local manifests and `chat.pluginLocations`.
   */
  public async getTree(): Promise<MarketplaceNode[]> {
    const locations = SettingsManager.getPluginLocations();
    const installedKeys = await this._installed.getInstalledKeys();
    const blockedKeys = this._vsCodeEnablement.getDisabledKeys() ?? new Set<string>();
    const suggestions = new Map(SUGGESTED_MARKETPLACES.map((s) => [MarketplaceService.keyOf(s.source), s]));

    return Promise.all(
      this.getConfigured().map(async (source): Promise<MarketplaceNode> => {
        const suggestion = suggestions.get(MarketplaceService.keyOf(source));
        const manifest = await this._reader.read(source, locations);
        return {
          source,
          name: suggestion?.name ?? manifest?.name ?? source,
          isNexus: suggestion?.isNexus ?? false,
          url: MarketplacePluginReader.toUrl(source),
          isAvailable: manifest !== undefined,
          plugins: (manifest?.plugins ?? []).map((plugin) => {
            const key = plugin.path ? MarketplacePluginReader.pathKey(plugin.path) : undefined;
            const installedByVsCode = !!key && installedKeys.has(key);
            const blockedByVsCode = !!key && blockedKeys.has(key);
            return {
              ...plugin,
              ...(installedByVsCode ? { enabled: true, installedByVsCode } : {}),
              ...(blockedByVsCode ? { blockedByVsCode } : {}),
            };
          }),
        };
      })
    );
  }

  /**
   * Enables or disables a plugin folder in `chat.pluginLocations`. A plugin installed through
   * the VS Code plugin browser is removed from `installed.json` so the setting takes effect.
   */
  public async setPluginEnabled(pluginPath: string, enabled: boolean): Promise<void> {
    await this.setPluginsEnabled([pluginPath], enabled);
  }

  /** Enables or disables every local plugin of a marketplace. */
  public async setMarketplaceEnabled(source: string, enabled: boolean): Promise<void> {
    const key = MarketplaceService.keyOf(source);
    const node = (await this.getTree()).find((m) => MarketplaceService.keyOf(m.source) === key);
    const paths = node?.plugins.map((p) => p.path).filter((p): p is string => !!p) ?? [];
    await this.setPluginsEnabled(paths, enabled);
  }

  private async setPluginsEnabled(paths: string[], enabled: boolean): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    // Serialize read-modify-write cycles so rapid toggles don't overwrite each other.
    const run = this._writeQueue.then(() => this.writePluginsEnabled(paths, enabled));
    this._writeQueue = run.catch(() => undefined);
    return run;
  }

  private async writePluginsEnabled(paths: string[], enabled: boolean): Promise<void> {
    const locations = SettingsManager.getPluginLocations();
    for (const pluginPath of paths) {
      // Reuse the existing key spelling (slashes/case) so VS Code does not see a duplicate entry.
      const existing = Object.keys(locations).find(
        (k) => MarketplacePluginReader.pathKey(k) === MarketplacePluginReader.pathKey(pluginPath)
      );
      locations[existing ?? MarketplacePluginReader.toPosix(pluginPath)] = enabled;
    }
    await SettingsManager.setPluginLocations(locations);
    // Plugins installed through the VS Code plugin browser ignore chat.pluginLocations: hand them over to it.
    await this._installed.remove(paths);
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
    this._installedWatcher.dispose();
    this._stateWatcher?.dispose();
    clearTimeout(this._stateDebounce);
    this._onDidChange.dispose();
  }
}
