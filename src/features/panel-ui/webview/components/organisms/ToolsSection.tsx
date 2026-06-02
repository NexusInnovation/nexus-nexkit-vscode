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
 * Developer tools section with NexKit setup and workflow runner
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
              <span>Set Up NexKit</span>
            </button>
            <p class="button-description">Install NexKit templates and configuration to your user directory</p>
          </div>
        </div>
      )}
      <CollapsibleSection id="tools-workflow-runner" title="GitHub Workflow Runner">
        <WorkflowRunnerTool />
      </CollapsibleSection>
    </>
  );
}
