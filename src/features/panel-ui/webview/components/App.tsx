import { useAppState } from "../hooks/useAppState";
import { ActionsSection } from "./organisms/ActionsSection";
import { ProfileSection } from "./organisms/ProfileSection";
import { TemplateSection } from "./organisms/TemplateSection";

/**
 * Root component for the Nexkit webview panel
 */
export function App() {
  const { workspace } = useAppState();

  if (!workspace.isReady) {
    return (
      <div class="container">
        <p>Loading Nexkit...</p>
      </div>
    );
  }

  if (!workspace.hasWorkspace) {
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
      <ActionsSection isInitialized={workspace.isInitialized} />
      <ProfileSection />
      <TemplateSection />
    </div>
  );
}
