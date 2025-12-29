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

  return (
    <div class="actions-section">
      <div class="action-item">
        <button
          id="initProjectBtn"
          class="action-button"
          disabled={!workspaceState.hasWorkspace}
          onClick={initializeWorkspace}
        >
          <span>{buttonText}</span>
        </button>
        <p class={`button-description ${!workspaceState.hasWorkspace ? "disabled" : ""}`}>
          {description}
        </p>
      </div>
      <div class="action-item">
        <button
          id="updateTemplatesBtn"
          class="action-button"
          disabled={!workspaceState.hasWorkspace}
          onClick={updateInstalledTemplates}
        >
          <span>Update Installed Templates</span>
        </button>
        <p class={`button-description ${!workspaceState.hasWorkspace ? "disabled" : ""}`}>
          Update all installed templates to their latest versions from repositories.
        </p>
      </div>
    </div>
  );
}
