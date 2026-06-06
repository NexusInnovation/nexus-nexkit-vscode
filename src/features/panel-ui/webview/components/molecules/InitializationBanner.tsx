import { useAppState } from "../../hooks/useAppState";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";

/**
 * InitializationBanner component
 * Renders a prominent prompt to set up NexKit on all tabs until the workspace
 * is initialized or the user explicitly dismisses the prompt.
 * Self-hiding: returns null when workspace is already initialized or dismissed.
 */
export function InitializationBanner() {
  const { workspace } = useAppState();
  const messenger = useVSCodeAPI();

  if (workspace.isInitialized || workspace.isInitRefused) {
    return null;
  }

  return (
    <div class="init-banner">
      <button
        class="action-button primary"
        onClick={() => messenger.sendMessage({ command: "initWorkspace" })}
      >
        <span class="codicon codicon-rocket" />
        <span>Set Up NexKit</span>
      </button>
      <button
        class="action-button secondary"
        onClick={() => messenger.sendMessage({ command: "dismissInitWorkspace" })}
      >
        <span>Not now</span>
      </button>
    </div>
  );
}
