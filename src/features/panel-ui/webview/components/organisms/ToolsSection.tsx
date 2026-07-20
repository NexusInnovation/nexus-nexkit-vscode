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

  const openRtfConverter = (): void => {
    messenger.sendMessage({ command: "openRtfConverter" });
  };

  const openCronScheduleBuilder = (): void => {
    messenger.sendMessage({ command: "openCronScheduleBuilder" });
  };

  // Request workflow list when the section mounts (if not already loaded)
  useEffect(() => {
    if (!workflows.isReady) {
      messenger.sendMessage({ command: "listWorkflows" });
    }
  }, []);

  return (
    <>
      <CollapsibleSection id="tools-rtf-converter" title="RTF to Markdown">
        <button class="action-button" onClick={openRtfConverter}>
          Open RTF to Markdown
        </button>
      </CollapsibleSection>
      <CollapsibleSection id="tools-cron-schedule-builder" title="Cron Job Schedule Builder">
        <button class="action-button" onClick={openCronScheduleBuilder}>
          Open Cron Schedule Builder
        </button>
      </CollapsibleSection>
      <CollapsibleSection id="tools-workflow-runner" title="GitHub Workflow Runner">
        <WorkflowRunnerTool />
      </CollapsibleSection>
    </>
  );
}
