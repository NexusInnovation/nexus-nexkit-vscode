import { useEffect } from "preact/hooks";
import { WorkflowRunnerTool } from "../molecules/WorkflowRunnerTool";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { useAppState } from "../../hooks/useAppState";

/**
 * ToolsSection Component
 * Developer tools section with GitHub Workflow Runner.
 * The initialization prompt is handled globally by InitializationBanner.
 */
export function ToolsSection() {
  const messenger = useVSCodeAPI();
  const { workflows } = useAppState();

  const openConvertToMarkdown = (): void => {
    messenger.sendMessage({ command: "openConvertToMarkdown" });
  };

  // Request workflow list when the section mounts (if not already loaded)
  useEffect(() => {
    if (!workflows.isReady) {
      messenger.sendMessage({ command: "listWorkflows" });
    }
  }, []);

  return (
    <>
      <CollapsibleSection id="tools-convert-to-markdown" title="Convert to Markdown">
        <button class="action-button" onClick={openConvertToMarkdown}>
          Open Convert to Markdown
        </button>
      </CollapsibleSection>
      <CollapsibleSection id="tools-workflow-runner" title="GitHub Workflow Runner">
        <WorkflowRunnerTool />
      </CollapsibleSection>
    </>
  );
}
