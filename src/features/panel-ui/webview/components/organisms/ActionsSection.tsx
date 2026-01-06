import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";

interface ActionsSectionProps {
  isInitialized: boolean;
}

export function ActionsSection({ isInitialized }: ActionsSectionProps) {
  const messenger = useVSCodeAPI();

  const initializeWorkspace = () => {
    messenger.sendMessage({ command: "initWorkspace" });
  };

  if (isInitialized) return null;

  return (
    <div class="action-item">
      <button class="action-button" onClick={initializeWorkspace}>
        <span>Initialize Project</span>
      </button>
      <p class="button-description">Set up Nexkit templates and configuration for your workspace</p>
    </div>
  );
}
