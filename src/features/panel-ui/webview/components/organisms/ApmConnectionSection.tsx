import { useState } from "preact/hooks";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { useDevOpsConnections } from "../../hooks/useDevOpsConnections";

/**
 * ApmConnectionSection Component
 * Manages Azure DevOps MCP connections in APM mode
 * - Lists existing connections
 * - Allows adding new connections via URL
 * - Allows selecting the active connection
 * - Allows removing connections
 */
export function ApmConnectionSection() {
  const { connections, activeConnection, isReady, error, addConnection, removeConnection, setActiveConnection } =
    useDevOpsConnections();

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleAddClick = () => {
    setIsAddingNew(true);
    setLocalError(null);
  };

  const handleCancelAdd = () => {
    setIsAddingNew(false);
    setNewUrl("");
    setLocalError(null);
  };

  const handleSubmitUrl = () => {
    const trimmedUrl = newUrl.trim();
    if (!trimmedUrl) {
      setLocalError("Please enter a DevOps project URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(trimmedUrl);
    } catch {
      setLocalError("Please enter a valid URL");
      return;
    }

    addConnection(trimmedUrl);
    setIsAddingNew(false);
    setNewUrl("");
    setLocalError(null);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmitUrl();
    } else if (e.key === "Escape") {
      handleCancelAdd();
    }
  };

  const displayError = localError || error;

  return (
    <CollapsibleSection id="connections" title="DevOps Connections" defaultExpanded>
      <>
        {!isReady && <p class="loading">Loading connections...</p>}

        {isReady && (
          <>
            {/* Connection List */}
            {connections.length === 0 && !isAddingNew && (
              <p class="empty-message">No DevOps connections configured. Add a connection to enable Azure DevOps MCP integration.</p>
            )}

            {connections.length > 0 && (
              <div class="connections-list">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    class={`connection-item ${connection.isActive ? "active" : ""}`}
                    onClick={() => !connection.isActive && setActiveConnection(connection.id)}
                  >
                    <div class="connection-info">
                      <div class="connection-name">
                        {connection.isActive && <i class="codicon codicon-check connection-active-icon"></i>}
                        {connection.organization}/{connection.project}
                      </div>
                      <div class="connection-details">Azure DevOps</div>
                    </div>
                    <div class="connection-actions">
                      <button
                        class="connection-action-button delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeConnection(connection.id);
                        }}
                        title={`Remove connection "${connection.organization}/${connection.project}"`}
                      >
                        <i class="codicon codicon-trash"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Connection Form */}
            {isAddingNew ? (
              <div class="add-connection-form">
                <input
                  type="text"
                  class="connection-url-input"
                  placeholder="https://dev.azure.com/org/project"
                  value={newUrl}
                  onInput={(e) => setNewUrl((e.target as HTMLInputElement).value)}
                  onKeyDown={handleKeyDown}
                  autofocus
                />
                <div class="add-connection-actions">
                  <button class="button secondary" onClick={handleCancelAdd}>
                    Cancel
                  </button>
                  <button class="button primary" onClick={handleSubmitUrl}>
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button class="button add-connection-button" onClick={handleAddClick}>
                <i class="codicon codicon-add"></i> Add Connection
              </button>
            )}

            {/* Error Display */}
            {displayError && <div class="connection-error">{displayError}</div>}
          </>
        )}
      </>
    </CollapsibleSection>
  );
}
