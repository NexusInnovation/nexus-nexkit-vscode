import { useMemo } from "preact/hooks";
import { useAppState } from "../hooks/useAppState";
import { useMode } from "../hooks/useMode";
import { useActiveTab } from "../hooks/useActiveTab";
import { ApmActionsSection } from "./organisms/ApmActionsSection";
import { FooterSection } from "./organisms/FooterSection";
import { MarketplaceSection } from "./organisms/MarketplaceSection";
import { ApmConnectionSection } from "./organisms/ApmConnectionSection";
import { ModeSelectionSection } from "./organisms/ModeSelectionSection";
import { ToolsSection } from "./organisms/ToolsSection";
import { TabBar, TabDefinition } from "./molecules/TabBar";
import { InitializationBanner } from "./molecules/InitializationBanner";

const TAB_DEFINITIONS: Record<string, TabDefinition> = {
  marketplaces: { id: "marketplaces", icon: "extensions", label: "Marketplaces" },
  project: { id: "project", icon: "azure-devops", label: "Project" },
  tools: { id: "tools", icon: "tools", label: "Tools" },
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
      return [TAB_DEFINITIONS.marketplaces, TAB_DEFINITIONS.tools];
    }
    if (isAPMMode) {
      return [TAB_DEFINITIONS.marketplaces, TAB_DEFINITIONS.tools, TAB_DEFINITIONS.project];
    }
    return [];
  }, [isDevelopersMode, isAPMMode]);

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const [activeTab, setActiveTab] = useActiveTab(tabIds);

  // Compute tab badges
  const badges = useMemo<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {};

    // Show badge dot on Developer tabs until workspace is initialized or dismissed
    const showInitBadge = isDevelopersMode && !workspace.isInitialized && !workspace.isInitRefused;
    if (showInitBadge) {
      result.marketplaces = true;
      result.tools = true;
    }

    return result;
  }, [isDevelopersMode, workspace.isInitialized, workspace.isInitRefused]);
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
      {isAPMMode && <ApmActionsSection isInitialized={workspace.isInitialized} />}

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} badges={badges} />

      <div class="tab-content">
        {isDevelopersMode && <InitializationBanner />}
        {activeTab === "marketplaces" && (
          <div class="tab-panel" role="tabpanel" id="marketplaces-tabpanel">
            <MarketplaceSection />
          </div>
        )}
        {activeTab === "tools" && (
          <div class="tab-panel" role="tabpanel" id="tools-tabpanel">
            <ToolsSection />
          </div>
        )}
        {isAPMMode && activeTab === "project" && (
          <div class="tab-panel" role="tabpanel" id="project-tabpanel">
            <ApmConnectionSection />
          </div>
        )}
      </div>
      <FooterSection />
    </div>
  );
}
