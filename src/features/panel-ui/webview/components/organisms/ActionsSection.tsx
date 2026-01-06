import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";

interface ActionsSectionProps {
  isInitialized: boolean;
}

export function ActionsSection({ isInitialized }: ActionsSectionProps) {
  const messenger = useVSCodeAPI();

  const initializeWorkspace = () => {
    messenger.sendMessage({ command: "initWorkspace" });
  };

  const updateInstalledTemplates = () => {
    messenger.sendMessage({ command: "updateInstalledTemplates" });
  };

  return (
    <div class="actions-section">
      {!isInitialized ? (
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
