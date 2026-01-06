import { useWorkspaceState } from "../../hooks/useWorkspaceState";

/**
 * ActionsSection Component with main action buttons for the Nexkit webview panel
 */
export function ActionsSection() {
  const { workspaceState, initializeWorkspace, updateInstalledTemplates } = useWorkspaceState();

  // Show message if no workspace is open
  if (!workspaceState.hasWorkspace) {
    return (
      <div class="actions-section">
        <div class="no-workspace-message">
          <p>Please open a workspace to use Nexkit features.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="actions-section">
      {!workspaceState.isInitialized ? (
        <div class="action-item">
          <button id="initProjectBtn" class="action-button" onClick={initializeWorkspace}>
            <span>Initialize Project</span>
          </button>
          <p class="button-description">Set up Nexkit templates and configuration for your workspace</p>
        </div>
      ) : (
        <div class="action-item">
          <button id="updateTemplatesBtn" class="action-button" onClick={updateInstalledTemplates}>
            <span>Update Installed Templates</span>
          </button>
          <p class="button-description">Update all installed templates to their latest versions from repositories.</p>
        </div>
      )}
    </div>
  );
}
