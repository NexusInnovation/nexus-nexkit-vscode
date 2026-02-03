import { useAppState } from "../hooks/useAppState";
import { useMode } from "../hooks/useMode";
import { ActionsSection } from "./organisms/ActionsSection";
import { FooterSection } from "./organisms/FooterSection";
import { ProfileSection } from "./organisms/ProfileSection";
import { TemplateSection } from "./organisms/TemplateSection";

/**
 * Root component for the Nexkit webview panel
 */
export function App() {
  const { workspace } = useAppState();
  const { isDevelopersMode } = useMode();

  if (!workspace.isReady) {
    return null;
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
      {isDevelopersMode && (
        <>
          <ActionsSection isInitialized={workspace.isInitialized} />
          <ProfileSection />
          <TemplateSection />
        </>
      )}
      <FooterSection />
    </div>
  );
}
