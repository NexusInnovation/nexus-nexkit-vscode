import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";

interface ApmActionsSectionProps {
  isInitialized: boolean;
}

export function ApmActionsSection({ isInitialized }: ApmActionsSectionProps) {
  const messenger = useVSCodeAPI();

  const initializeWorkspace = () => {
    messenger.sendMessage({ command: "initWorkspace" });
  };

  if (isInitialized) {
    return null;
  }

  return (
    <div class="actions-section">
      <div class="action-item">
        <button class="action-button" onClick={initializeWorkspace}>
          <span>Initialize Project</span>
        </button>
        <p class="button-description">Set up Nexkit templates and configuration for your workspace</p>
      </div>
    </div>
  );
}
