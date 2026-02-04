import { useState } from "preact/hooks";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { useDevOpsConnections } from "../../hooks/useDevOpsConnections";

/**
 * ApmConnectionSection Component
 * Manages Azure DevOps MCP connections in APM mode
 * - Only one connection can be active at a time
 * - Active connection uses standard "azure-devops" MCP name
 * - Clicking an inactive connection makes it active
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

  const handleConnectionClick = (connection: { id: string; isActive: boolean }) => {
    if (!connection.isActive) {
      setActiveConnection(connection.id);
    }
  };

  const displayError = localError || error;

  return (
    <CollapsibleSection id="connections" title="DevOps Projects" defaultExpanded>
      <>
        {!isReady && <p class="loading">Loading projects...</p>}

        {isReady && (
          <>
            {/* Connection List */}
            {connections.length === 0 && !isAddingNew && (
              <p class="empty-message">No DevOps projects configured. Add a project to enable Azure DevOps MCP integration.</p>
            )}

            {connections.length > 0 && (
              <div class="connections-list">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    class={`connection-item ${connection.isActive ? "active" : "inactive"}`}
                    onClick={() => handleConnectionClick(connection)}
                    title={connection.isActive ? "Active project" : "Click to make this the active project"}
                  >
                    <div class="connection-info">
                      <div class="connection-name">
                        {connection.isActive && <i class="codicon codicon-circle-filled connection-active-icon"></i>}
                        {!connection.isActive && <i class="codicon codicon-circle-outline connection-inactive-icon"></i>}
                        {connection.organization}/{connection.project}
                      </div>
                      {connection.isActive && <div class="connection-details">Active • MCP: azure-devops</div>}
                    </div>
                    <div class="connection-actions">
                      <button
                        class="connection-action-button delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeConnection(connection.id);
                        }}
                        title={`Remove project "${connection.organization}/${connection.project}"`}
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
                <i class="codicon codicon-add"></i> Add Project
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
