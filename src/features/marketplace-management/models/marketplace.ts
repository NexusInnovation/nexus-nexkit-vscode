/**
 * Source identifier of the private Nexus plugin marketplace (GitHub `owner/repo`).
 */
export const NEXUS_PLUGIN_MARKETPLACE = "NexusInnovation/nexus-plugin-marketplace";

/**
 * A marketplace that Nexkit proposes to add with one click.
 */
export interface MarketplaceSuggestion {
  /** Value stored in `chat.plugins.marketplaces` (GitHub `owner/repo`). */
  source: string;
  name: string;
  description: string;
  /** True for the Nexus marketplace, which is highlighted in the UI. */
  isNexus: boolean;
  /** Whether the marketplace is already present in the user settings. */
  isConfigured: boolean;
}

/**
 * A plugin listed in a marketplace manifest (`marketplace.json`).
 */
export interface PluginNode {
  name: string;
  description?: string;
  /** Grouping label (manifest `category`, or the `Category · ...` description prefix). */
  category?: string;
  /** Absolute plugin folder (forward slashes) used as key in `chat.pluginLocations`; undefined for remote plugin sources. */
  path?: string;
  /** Whether `chat.pluginLocations[path]` is true, or the plugin is installed through VS Code's plugin browser. */
  enabled: boolean;
  /** True when listed in VS Code's `installed.json`; toggling hands control over to `chat.pluginLocations`. */
  installedByVsCode?: boolean;
  /** True when switched off in the VS Code profile (Agent Customizations › Plugins); that switch wins over Nexkit. */
  blockedByVsCode?: boolean;
}

/**
 * A configured marketplace and the plugins it exposes.
 */
export interface MarketplaceNode {
  /** Entry of `chat.plugins.marketplaces`. */
  source: string;
  /** Display name (manifest `name`, suggestion name, or the source). */
  name: string;
  isNexus: boolean;
  /** Browsable URL of the marketplace repository, when known. */
  url?: string;
  /** False when no local clone/manifest was found (marketplace not synced yet). */
  isAvailable: boolean;
  plugins: PluginNode[];
}

/**
 * Marketplaces proposed in the panel. `isConfigured` is computed at send time.
 */
export const SUGGESTED_MARKETPLACES: ReadonlyArray<Omit<MarketplaceSuggestion, "isConfigured">> = [
  {
    source: NEXUS_PLUGIN_MARKETPLACE,
    name: "Nexus Marketplace",
    description: "Nexus agents, skills, prompts and instructions (private repository, requires GitHub access).",
    isNexus: true,
  },
  {
    source: "github/copilot-plugins",
    name: "GitHub Copilot Plugins",
    description: "Official plugins curated by GitHub.",
    isNexus: false,
  },
  {
    source: "github/awesome-copilot",
    name: "Awesome Copilot",
    description: "Community plugins, agents, skills and instructions.",
    isNexus: false,
  },
];
