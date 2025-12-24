/**
 * ActionsSection Component
 * Displays workspace initialization button
 */

import { WorkspaceState } from "../types";

interface ActionsSectionProps {
  workspaceState: WorkspaceState;
  onInitialize: () => void;
}

export function ActionsSection({ workspaceState, onInitialize }: ActionsSectionProps) {
  const { hasWorkspace, isInitialized } = workspaceState;

  const buttonText = isInitialized ? "Reinitialize Project" : "Initialize Project";
  const description = isInitialized
    ? "Reset and reconfigure Nexkit templates and configuration."
    : "Set up Nexkit templates and configuration for your workspace";

  return (
    <div class="actions-section">
      <div class="action-item">
        <button
          id="initProjectBtn"
          class="action-button"
          disabled={!hasWorkspace}
          onClick={onInitialize}
        >
          <span>{buttonText}</span>
        </button>
        <p class={`button-description ${!hasWorkspace ? "disabled" : ""}`}>
          {description}
        </p>
      </div>
    </div>
  );
}
