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
