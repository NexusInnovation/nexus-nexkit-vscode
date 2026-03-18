import { useMemo } from "preact/hooks";
import { useAppState } from "../hooks/useAppState";
import { useMode } from "../hooks/useMode";
import { useActiveTab } from "../hooks/useActiveTab";
import { ActionsSection } from "./organisms/ActionsSection";
import { ApmActionsSection } from "./organisms/ApmActionsSection";
import { FooterSection } from "./organisms/FooterSection";
import { ProfileSection } from "./organisms/ProfileSection";
import { TemplateSection } from "./organisms/TemplateSection";
import { ApmConnectionSection } from "./organisms/ApmConnectionSection";
import { ApmTemplateSection } from "./organisms/ApmTemplateSection";
import { ModeSelectionSection } from "./organisms/ModeSelectionSection";
import { ToolsSection } from "./organisms/ToolsSection";
import { TabBar, TabDefinition } from "./molecules/TabBar";

const TAB_DEFINITIONS: Record<string, TabDefinition> = {
  template: { id: "template", icon: "file-code", label: "Templates" },
  project: { id: "project", icon: "azure-devops", label: "Project" },
  tools: { id: "tools", icon: "tools", label: "Tools" },
  profile: { id: "profile", icon: "account", label: "Profiles" },
};

/**
 * Root component for the Nexkit webview panel
 */
export function App() {
  const { workspace } = useAppState();
  const { isNoneMode, isDevelopersMode, isAPMMode } = useMode();

  // Build the list of visible tabs based on the current mode
  const tabs = useMemo<TabDefinition[]>(() => {
    if (isDevelopersMode) {
      return [TAB_DEFINITIONS.template, TAB_DEFINITIONS.tools, TAB_DEFINITIONS.profile];
    }
    if (isAPMMode) {
      return [TAB_DEFINITIONS.template, TAB_DEFINITIONS.project];
    }
    return [];
  }, [isDevelopersMode, isAPMMode]);

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const [activeTab, setActiveTab] = useActiveTab(tabIds);

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
      {isDevelopersMode && <ActionsSection isInitialized={workspace.isInitialized} />}
      {isAPMMode && <ApmActionsSection isInitialized={workspace.isInitialized} />}

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div class="tab-content" role="tabpanel">
        {isDevelopersMode && (
          <>
            {activeTab === "template" && <TemplateSection />}
            {activeTab === "tools" && <ToolsSection />}
            {activeTab === "profile" && <ProfileSection />}
          </>
        )}
        {isAPMMode && (
          <>
            {activeTab === "template" && <ApmTemplateSection />}
            {activeTab === "project" && <ApmConnectionSection />}
          </>
        )}
      </div>

      <FooterSection />
    </div>
  );
}
