import { useEffect } from "preact/hooks";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { WorkflowRunnerTool } from "../molecules/WorkflowRunnerTool";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { useAppState } from "../../hooks/useAppState";

/**
 * ToolsSection Component
 * Collapsible section providing developer tools (e.g., GitHub workflow runner)
 */
export function ToolsSection() {
  const messenger = useVSCodeAPI();
  const { workflows } = useAppState();

  // Request workflow list when the section mounts (if not already loaded)
  useEffect(() => {
    if (!workflows.isReady) {
      messenger.sendMessage({ command: "listWorkflows" });
    }
  }, []);

  return (
    <CollapsibleSection id="tools" title="Tools">
      <WorkflowRunnerTool />
    </CollapsibleSection>
  );
}
