/**
 * Custom hook for accessing plugin marketplaces state and actions
 */

import { useAppState } from "./useAppState";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { MarketplaceNode, MarketplaceSuggestion } from "../../../marketplace-management/models/marketplace";

export interface UseMarketplacesResult {
  /** Marketplace sources currently present in `chat.plugins.marketplaces` */
  configured: string[];
  /** Marketplaces proposed by Nexkit (Nexus first) */
  suggested: MarketplaceSuggestion[];
  /** Configured marketplaces with their plugins */
  tree: MarketplaceNode[];
  isReady: boolean;
  error?: string;
  addMarketplace: (source: string) => void;
  removeMarketplace: (source: string) => void;
  toggleMarketplace: (source: string, enabled: boolean) => void;
  togglePlugin: (path: string, enabled: boolean) => void;
  openMarketplaceRepo: (source: string) => void;
  openVsCodePluginSettings: () => void;
  refreshMarketplaces: () => void;
  openPluginBrowser: () => void;
}

export function useMarketplaces(): UseMarketplacesResult {
  const { marketplaces } = useAppState();
  const messenger = useVSCodeAPI();

  return {
    configured: marketplaces.configured,
    suggested: marketplaces.suggested,
    tree: marketplaces.tree,
    isReady: marketplaces.isReady,
    error: marketplaces.error,
    addMarketplace: (source: string) => messenger.sendMessage({ command: "addMarketplace", source }),
    removeMarketplace: (source: string) => messenger.sendMessage({ command: "removeMarketplace", source }),
    toggleMarketplace: (source: string, enabled: boolean) =>
      messenger.sendMessage({ command: "toggleMarketplace", source, enabled }),
    togglePlugin: (path: string, enabled: boolean) => messenger.sendMessage({ command: "togglePlugin", path, enabled }),
    openMarketplaceRepo: (source: string) => messenger.sendMessage({ command: "openMarketplaceRepo", source }),
    openVsCodePluginSettings: () => messenger.sendMessage({ command: "openVsCodePluginSettings" }),
    refreshMarketplaces: () => messenger.sendMessage({ command: "getMarketplaces" }),
    openPluginBrowser: () => messenger.sendMessage({ command: "openPluginBrowser" }),
  };
}
