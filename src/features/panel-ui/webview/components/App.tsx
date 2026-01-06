import { useEffect } from "preact/hooks";
import { useVSCodeAPI } from "../hooks/useVSCodeAPI";
import { ActionsSection } from "./organisms/ActionsSection";
import { ProfileSection } from "./organisms/ProfileSection";
import { TemplateSection } from "./organisms/TemplateSection";
import { useWorkspaceState } from "../hooks/useWorkspaceState";

/**
 * Root component for the Nexkit webview panel
 */
export function App() {
  const messenger = useVSCodeAPI();
  const { isReady, workspaceState } = useWorkspaceState();

  useEffect(() => {
    // Request initial state from extension
    messenger.sendMessage({ command: "webviewReady" });
  }, [messenger]);

  if (!isReady) {
    return (
      <div class="container">
        <p>Loading Nexkit...</p>
      </div>
    );
  }

  if (!workspaceState.hasWorkspace) {
    return (
      <div class="container">
        <div class="info-message">
          <p>Please open a workspace to use Nexkit features.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="container">
      <ActionsSection isInitialized={workspaceState.isInitialized} />
      <ProfileSection />
      <TemplateSection />
    </div>
  );
}
