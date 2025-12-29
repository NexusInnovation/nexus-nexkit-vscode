import { useWorkspaceState } from "../../hooks/useWorkspaceState";

/**
 * ActionsSection Component with main action buttons for the Nexkit webview panel
 */
export function ActionsSection() {
  const { workspaceState, initializeWorkspace, updateInstalledTemplates } = useWorkspaceState();
  
  const buttonText = workspaceState.isInitialized ? "Reinitialize Project" : "Initialize Project";
  const description = workspaceState.isInitialized
    ? "Reset and reconfigure Nexkit templates and configuration."
    : "Set up Nexkit templates and configuration for your workspace";

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
      <div class="action-item">
        <button
          id="initProjectBtn"
          class="action-button"
          onClick={initializeWorkspace}
        >
          <span>{buttonText}</span>
        </button>
        <p class="button-description">
          {description}
        </p>
      </div>
      {
        workspaceState.isInitialized && (
          <div class="action-item">
          <button
            id="updateTemplatesBtn"
            class="action-button"
            onClick={updateInstalledTemplates}
          >
            <span>Update Installed Templates</span>
          </button>
          <p class="button-description">
            Update all installed templates to their latest versions from repositories.
          </p>
          </div>
        )
      }
    </div>
  );
}
