import { useAppState } from "../hooks/useAppState";
import { useMode } from "../hooks/useMode";
import { ApmActionsSection } from "./organisms/ApmActionsSection";
import { ActionsSection } from "./organisms/ActionsSection";
import { FooterSection } from "./organisms/FooterSection";
import { ProfileSection } from "./organisms/ProfileSection";
import { TemplateSection } from "./organisms/TemplateSection";
import { ApmConnectionSection } from "./organisms/ApmConnectionSection";
import { ApmTemplateSection } from "./organisms/ApmTemplateSection";
import { ModeSelectionSection } from "./organisms/ModeSelectionSection";
import { ToolsSection } from "./organisms/ToolsSection";

/**
 * Root component for the Nexkit webview panel
 */
export function App() {
  const { workspace } = useAppState();
  const { isNoneMode, isDevelopersMode, isAPMMode } = useMode();

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

  // Show mode selection when mode is None
  if (isNoneMode) {
    return <ModeSelectionSection />;
  }

  return (
    <div class="container">
      {isDevelopersMode && (
        <>
          <ActionsSection isInitialized={workspace.isInitialized} />
          <ProfileSection />
          <TemplateSection />
          <ToolsSection />
        </>
      )}
      {isAPMMode && (
        <>
          <ApmTemplateSection />
          <ApmActionsSection isInitialized={workspace.isInitialized} />
          <ApmConnectionSection />
        </>
      )}
      <FooterSection />
    </div>
  );
}
