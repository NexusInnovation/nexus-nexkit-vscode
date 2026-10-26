/**
 * Custom hook for accessing plugin marketplaces state and actions
 */

import { useAppState } from "./useAppState";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { MarketplaceSuggestion } from "../../../marketplace-management/models/marketplace";

export interface UseMarketplacesResult {
  /** Marketplace sources currently present in `chat.plugins.marketplaces` */
  configured: string[];
  /** Marketplaces proposed by Nexkit (Nexus first) */
  suggested: MarketplaceSuggestion[];
  isReady: boolean;
  error?: string;
  addMarketplace: (source: string) => void;
  removeMarketplace: (source: string) => void;
  openPluginBrowser: () => void;
}

export function useMarketplaces(): UseMarketplacesResult {
  const { marketplaces } = useAppState();
  const messenger = useVSCodeAPI();

  return {
    configured: marketplaces.configured,
    suggested: marketplaces.suggested,
    isReady: marketplaces.isReady,
    error: marketplaces.error,
    addMarketplace: (source: string) => messenger.sendMessage({ command: "addMarketplace", source }),
    removeMarketplace: (source: string) => messenger.sendMessage({ command: "removeMarketplace", source }),
    openPluginBrowser: () => messenger.sendMessage({ command: "openPluginBrowser" }),
  };
}
