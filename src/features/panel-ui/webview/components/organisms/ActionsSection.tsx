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
        NexKit is set up. Browse and install templates below.
      </p>
    );
  }

  return (
    <div class="actions-section">
      <div class="action-item">
        <button class="action-button" onClick={initializeWorkspace}>
          <span>Set Up NexKit</span>
        </button>
        <p class="button-description">Install NexKit templates and configuration to your user directory</p>
      </div>
    </div>
  );
}
