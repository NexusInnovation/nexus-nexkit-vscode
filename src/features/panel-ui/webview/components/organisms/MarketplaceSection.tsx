import { useState } from "preact/hooks";
import { useMarketplaces } from "../../hooks/useMarketplaces";
import { SkeletonList } from "../atoms/Skeleton";

/**
 * MarketplaceSection Component
 * Adds/removes plugin marketplaces (chat.plugins.marketplaces) and opens the plugin browser.
 */
export function MarketplaceSection() {
  const { configured, suggested, isReady, error, addMarketplace, removeMarketplace, openPluginBrowser } = useMarketplaces();

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const closeForm = () => {
    setIsAddingNew(false);
    setNewSource("");
    setLocalError(null);
  };

  const handleSubmit = () => {
    const trimmed = newSource.trim();
    if (!trimmed) {
      setLocalError("Please enter a GitHub repository (owner/repo) or a git URL");
      return;
    }
    addMarketplace(trimmed);
    closeForm();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      closeForm();
    }
  };

  if (!isReady) {
    return <SkeletonList label="Loading marketplaces" rows={3} />;
  }

  const nexus = suggested.find((s) => s.isNexus);
  const otherSuggestions = suggested.filter((s) => !s.isNexus && !s.isConfigured);
  const displayError = localError || error;

  return (
    <>
      <p class="empty-message">
        Nexus agents, skills, prompts and instructions are distributed as plugins. Add the Nexus marketplace, then install plugins from
        the plugin browser.
      </p>

      {nexus && !nexus.isConfigured && (
        <div class="marketplace-highlight">
          <div class="marketplace-highlight-title">
            <i class="codicon codicon-verified"></i> {nexus.name}
          </div>
          <div class="connection-details">{nexus.description}</div>
          <button class="button primary" onClick={() => addMarketplace(nexus.source)}>
            <i class="codicon codicon-add"></i> Add Nexus Marketplace
          </button>
        </div>
      )}

      {configured.length === 0 && !isAddingNew && <p class="empty-message">No plugin marketplaces configured.</p>}

      {configured.length > 0 && (
        <div class="connections-list">
          {configured.map((source) => (
            <div key={source} class="connection-item active" title={source}>
              <div class="connection-info">
                <div class="connection-name">
                  <i class="codicon codicon-extensions connection-active-icon"></i>
                  {source}
                </div>
                {nexus && source.toLowerCase() === nexus.source.toLowerCase() && <div class="connection-details">Nexus marketplace</div>}
              </div>
              <div class="connection-actions">
                <button
                  class="connection-action-button delete-button"
                  onClick={() => removeMarketplace(source)}
                  title={`Remove marketplace "${source}"`}
                >
                  <i class="codicon codicon-trash"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {configured.length > 0 && (
        <button class="button add-connection-button" onClick={openPluginBrowser}>
          <i class="codicon codicon-search"></i> Browse Plugins
        </button>
      )}

      {otherSuggestions.length > 0 && (
        <div class="connections-list">
          {otherSuggestions.map((s) => (
            <div key={s.source} class="connection-item inactive" title={s.description}>
              <div class="connection-info">
                <div class="connection-name">{s.name}</div>
                <div class="connection-details">{s.source}</div>
              </div>
              <div class="connection-actions">
                <button class="connection-action-button" onClick={() => addMarketplace(s.source)} title={`Add marketplace "${s.source}"`}>
                  <i class="codicon codicon-add"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAddingNew ? (
        <div class="add-connection-form">
          <input
            type="text"
            class="connection-url-input"
            placeholder="owner/repo or https://github.com/owner/repo"
            value={newSource}
            onInput={(e) => setNewSource((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            autofocus
          />
          <div class="add-connection-actions">
            <button class="button secondary" onClick={closeForm}>
              Cancel
            </button>
            <button class="button primary" onClick={handleSubmit}>
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          class="button add-connection-button"
          onClick={() => {
            setIsAddingNew(true);
            setLocalError(null);
          }}
        >
          <i class="codicon codicon-add"></i> Add Custom Marketplace
        </button>
      )}

      {displayError && <div class="connection-error">{displayError}</div>}
    </>
  );
}
