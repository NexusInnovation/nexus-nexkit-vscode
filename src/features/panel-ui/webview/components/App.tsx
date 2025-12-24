/**
 * App Component
 * Root component for the Nexkit webview panel
 */

import { useWorkspaceState } from "../hooks/useWorkspaceState";
import { useTemplateData } from "../hooks/useTemplateData";
import { ActionsSection } from "./ActionsSection";
import { TemplateSection } from "./TemplateSection";

export function App() {
  const { workspaceState, initializeWorkspace } = useWorkspaceState();
  const {
    repositories,
    installedTemplates,
    installTemplate,
    uninstallTemplate,
    isTemplateInstalled,
  } = useTemplateData();

  return (
    <div class="container">
      <ActionsSection
        workspaceState={workspaceState}
        onInitialize={initializeWorkspace}
      />

      <TemplateSection
        repositories={repositories}
        installedTemplates={installedTemplates}
        onInstall={installTemplate}
        onUninstall={uninstallTemplate}
        isTemplateInstalled={isTemplateInstalled}
      />
    </div>
  );
}
