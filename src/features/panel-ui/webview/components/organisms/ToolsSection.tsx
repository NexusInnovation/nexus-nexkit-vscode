import { useEffect } from "preact/hooks";
import { WorkflowRunnerTool } from "../molecules/WorkflowRunnerTool";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { useAppState } from "../../hooks/useAppState";

interface ToolsSectionProps {
  isInitialized: boolean;
}

/**
 * ToolsSection Component
 * Developer tools section with workspace initialization and workflow runner
 */
export function ToolsSection({ isInitialized }: ToolsSectionProps) {
  const messenger = useVSCodeAPI();
  const { workflows } = useAppState();

  // Request workflow list when the section mounts (if not already loaded)
  useEffect(() => {
    if (!workflows.isReady) {
      messenger.sendMessage({ command: "listWorkflows" });
    }
  }, []);

  const initializeWorkspace = () => {
    messenger.sendMessage({ command: "initWorkspace" });
  };

  return (
    <>
      {!isInitialized && (
        <div class="actions-section">
          <div class="action-item">
            <button class="action-button" onClick={initializeWorkspace}>
              <span>Initialize Project</span>
            </button>
            <p class="button-description">Set up Nexkit templates and configuration for your workspace</p>
          </div>
        </div>
      )}
      <CollapsibleSection id="tools-workflow-runner" title="GitHub Workflow Runner">
        <WorkflowRunnerTool />
      </CollapsibleSection>
    </>
  );
}
