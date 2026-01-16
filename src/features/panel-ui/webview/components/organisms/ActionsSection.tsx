import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";

interface ActionsSectionProps {
  isInitialized: boolean;
}

export function ActionsSection({ isInitialized }: ActionsSectionProps) {
  const messenger = useVSCodeAPI();

  const initializeWorkspace = () => {
    messenger.sendMessage({ command: "initWorkspace" });
  };

  if (isInitialized) {
    return (
      <p style="font-size: 0.8em; color: var(--vscode-descriptionForeground); margin: 0 8px 8px 8px;">
        Your project is set up with Nexkit. Browse and install templates below.
      </p>
    );
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
