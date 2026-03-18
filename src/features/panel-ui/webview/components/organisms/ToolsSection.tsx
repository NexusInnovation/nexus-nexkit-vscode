import { useEffect } from "preact/hooks";
import { WorkflowRunnerTool } from "../molecules/WorkflowRunnerTool";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { useAppState } from "../../hooks/useAppState";

/**
 * ToolsSection Component
 * Developer tools section (e.g., GitHub workflow runner)
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

  return <WorkflowRunnerTool />;
}
