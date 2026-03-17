import { useState } from "preact/hooks";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { useAppState } from "../../hooks/useAppState";
import { WorkflowInfo } from "../../../../github-workflow-runner/githubWorkflowRunnerService";

const EVENTS = ["push", "pull_request", "workflow_dispatch", "schedule", "release"] as const;

/**
 * WorkflowRunnerTool Component
 * Provides a form to select and run a GitHub Actions workflow locally via act
 */
export function WorkflowRunnerTool() {
  const messenger = useVSCodeAPI();
  const { workflows } = useAppState();

  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  const [job, setJob] = useState("");
  const [event, setEvent] = useState<string>("push");
  const [dryRun, setDryRun] = useState(false);
  const [listOnly, setListOnly] = useState(false);

  const handleRefresh = () => {
    messenger.sendMessage({ command: "listWorkflows" });
  };

  const handleRun = () => {
    if (!selectedWorkflow) {
      return;
    }
    messenger.sendMessage({
      command: "runWorkflow",
      workflowFile: selectedWorkflow,
      job: job.trim() || undefined,
      event,
      dryRun,
      list: listOnly,
    });
  };

  const handleListJobs = () => {
    if (!selectedWorkflow) {
      return;
    }
    messenger.sendMessage({
      command: "runWorkflow",
      workflowFile: selectedWorkflow,
      event,
      dryRun: false,
      list: true,
    });
  };

  if (!workflows.isReady) {
    return <p class="loading">Loading workflows...</p>;
  }

  if (workflows.list.length === 0) {
    return (
      <div class="workflow-runner-empty">
        <p class="empty-message">No workflow files found in .github/workflows/</p>
        <button class="action-button workflow-refresh-btn" onClick={handleRefresh}>
          <i class="codicon codicon-refresh"></i>
          <span>Refresh</span>
        </button>
      </div>
    );
  }

  return (
    <div class="workflow-runner">
      {/* Workflow selection */}
      <div class="workflow-field">
        <label class="workflow-label">Workflow</label>
        <div class="workflow-select-row">
          <select
            class="workflow-select"
            title="Select a workflow file"
            value={selectedWorkflow}
            onChange={(e) => setSelectedWorkflow((e.target as HTMLSelectElement).value)}
          >
            <option value="">-- Select a workflow --</option>
            {workflows.list.map((wf: WorkflowInfo) => (
              <option key={wf.relativePath} value={wf.relativePath}>
                {wf.name}
              </option>
            ))}
          </select>
          <button class="workflow-icon-btn" onClick={handleRefresh} title="Refresh workflow list">
            <i class="codicon codicon-refresh"></i>
          </button>
        </div>
      </div>

      {/* Event selection */}
      <div class="workflow-field">
        <label class="workflow-label">Event</label>
        <select class="workflow-select" title="Select event type" value={event} onChange={(e) => setEvent((e.target as HTMLSelectElement).value)}>
          {EVENTS.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
      </div>

      {/* Job filter */}
      <div class="workflow-field">
        <label class="workflow-label">Job (optional)</label>
        <input
          class="workflow-input"
          type="text"
          placeholder="e.g. build, test"
          value={job}
          onInput={(e) => setJob((e.target as HTMLInputElement).value)}
        />
      </div>

      {/* Flags */}
      <div class="workflow-flags">
        <label class="workflow-checkbox-label">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun((e.target as HTMLInputElement).checked)} />
          <span>Dry Run</span>
        </label>
      </div>

      {/* Actions */}
      <div class="workflow-actions">
        <button class="action-button workflow-run-btn" onClick={handleRun} disabled={!selectedWorkflow}>
          <i class="codicon codicon-play"></i>
          <span>Run Workflow</span>
        </button>
        <button class="action-button workflow-list-btn" onClick={handleListJobs} disabled={!selectedWorkflow}>
          <i class="codicon codicon-list-flat"></i>
          <span>List Jobs</span>
        </button>
      </div>
    </div>
  );
}
