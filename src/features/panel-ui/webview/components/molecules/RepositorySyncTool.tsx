import { useEffect, useState } from "preact/hooks";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { useAppState } from "../../hooks/useAppState";
import {
  RepositorySyncActionType,
  RepositorySyncConflictActionGroup,
} from "../../../../repository-sync/models/repositorySyncModels";

const CONFLICT_GROUP_OPTIONS: Array<{ value: RepositorySyncConflictActionGroup; label: string }> = [
  { value: "workspace-conflict", label: "Workspace conflict" },
  { value: "external-conflict", label: "External conflict" },
];

const ACTION_OPTIONS_BY_GROUP: Record<RepositorySyncConflictActionGroup, Array<{ value: RepositorySyncActionType; label: string }>> = {
  "workspace-conflict": [
    { value: "open-workspace-scm", label: "Open Workspace SCM" },
    { value: "retry", label: "Retry" },
    { value: "retry-failed-only", label: "Retry Failed Only" },
    { value: "ignore", label: "Ignore" },
  ],
  "external-conflict": [
    { value: "open-external-repo", label: "Open External Repository" },
    { value: "retry", label: "Retry" },
    { value: "retry-failed-only", label: "Retry Failed Only" },
    { value: "ignore", label: "Ignore" },
  ],
};

export function RepositorySyncTool() {
  const messenger = useVSCodeAPI();
  const appState = useAppState();
  const [conflictGroup, setConflictGroup] = useState<RepositorySyncConflictActionGroup | "">("");
  const [action, setAction] = useState<RepositorySyncActionType | "">("");
  const [localStatus, setLocalStatus] = useState<string>("Ready");

  const setStatus = (message: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLocalStatus(`${message} at ${timestamp}`);
  };

  useEffect(() => {
    messenger.sendMessage({ command: "repositorySyncGetConfiguration" });
  }, [messenger]);

  const actionOptions = conflictGroup ? ACTION_OPTIONS_BY_GROUP[conflictGroup] : [];
  const canApplyBatchAction = conflictGroup !== "" && action !== "";
  const hostFeedback = appState.repositorySync.lastFeedback;
  const recentHostFeedback = appState.repositorySync.history.slice(0, 3);
  const repositorySyncConfig = appState.repositorySync.config;
  const activeStatus = hostFeedback
    ? `${hostFeedback.message} (${new Date(hostFeedback.timestamp).toLocaleTimeString()})`
    : localStatus;
  const activeStatusClass = hostFeedback ? `repository-sync-status ${`repository-sync-status-${hostFeedback.level}`}` : "repository-sync-status";

  const handleRunSyncNow = () => {
    messenger.sendMessage({ command: "repositorySyncRunOnce" });
    setStatus("Run request sent");
  };

  const handleRetryFailedOnly = () => {
    messenger.sendMessage({ command: "repositorySyncRetryFailedOnly" });
    setStatus("Retry failed request sent");
  };

  const handleRetrySpecificRepository = () => {
    messenger.sendMessage({ command: "repositorySyncRetrySpecific" });
    setStatus("Retry repository request sent");
  };

  const handleShowSyncOutput = () => {
    messenger.sendMessage({ command: "repositorySyncShowOutput" });
    setStatus("Output request sent");
  };

  const handleRequestConfiguration = () => {
    messenger.sendMessage({ command: "repositorySyncGetConfiguration" });
    setStatus("Configuration refresh requested");
  };

  const handleBrowseAddWatchedRepository = () => {
    messenger.sendMessage({ command: "repositorySyncBrowseAddWatchedRepository" });
    setStatus("Browse watched repository requested");
  };

  const handleRemoveWatchedRepository = (repositoryPath: string) => {
    messenger.sendMessage({ command: "repositorySyncRemoveWatchedRepository", path: repositoryPath });
    setStatus("Remove watched repository requested");
  };

  const handleBrowseAddScanRoot = () => {
    messenger.sendMessage({ command: "repositorySyncBrowseAddScanRoot" });
    setStatus("Browse scan root requested");
  };

  const handleRemoveScanRoot = (rootPath: string) => {
    messenger.sendMessage({ command: "repositorySyncRemoveScanRoot", path: rootPath });
    setStatus("Remove scan root requested");
  };

  const handleHideRepository = (repositoryPath: string) => {
    messenger.sendMessage({ command: "repositorySyncHideRepository", path: repositoryPath });
    setStatus("Hide repository requested");
  };

  const handleUnhideRepository = (repositoryPath: string) => {
    messenger.sendMessage({ command: "repositorySyncUnhideRepository", path: repositoryPath });
    setStatus("Show repository requested");
  };

  const handleConflictGroupChange = (value: string) => {
    const nextGroup = value as RepositorySyncConflictActionGroup | "";
    setConflictGroup(nextGroup);
    setAction("");
    if (nextGroup) {
      setStatus("Conflict group selected");
    }
  };

  const handleApplyBatchConflictAction = () => {
    if (!canApplyBatchAction) {
      return;
    }

    messenger.sendMessage({
      command: "repositorySyncApplyBatchConflictAction",
      conflictGroup,
      action,
    });
    setStatus("Batch action request sent");
  };

  return (
    <div class="repository-sync-tool">
      <p class="repository-sync-helper-text">Conflicts are never auto-resolved. Choose an explicit action before applying batch conflict handling.</p>

      <p class={activeStatusClass} role="status" aria-live="polite" title="Most recent repository sync action status">
        Status: {activeStatus}
      </p>

      {recentHostFeedback.length > 0 && (
        <ul class="repository-sync-feedback-history" aria-label="Recent repository sync feedback">
          {recentHostFeedback.map((entry, index) => (
            <li key={`${entry.timestamp}-${entry.actionType}-${index}`} class={`repository-sync-feedback-entry repository-sync-feedback-entry-${entry.level}`}>
              <span class="repository-sync-feedback-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span class="repository-sync-feedback-message">{entry.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div class="repository-sync-actions">
        <button class="action-button" title="Run repository sync now" aria-label="Run repository sync now" onClick={handleRunSyncNow}>
          Run now
        </button>
        <button class="action-button" title="Show repository sync output" aria-label="Show repository sync output" onClick={handleShowSyncOutput}>
          Show output
        </button>
        <button class="action-button" title="Retry only failed repository sync operations" aria-label="Retry only failed repository sync operations" onClick={handleRetryFailedOnly}>
          Retry failed
        </button>
        <button class="action-button" title="Retry repository sync for a specific repository" aria-label="Retry repository sync for a specific repository" onClick={handleRetrySpecificRepository}>
          Retry repo
        </button>
        <button
          class="action-button"
          title="Refresh repository sync configuration"
          aria-label="Refresh repository sync configuration"
          onClick={handleRequestConfiguration}
        >
          Refresh config
        </button>
      </div>

      <div class="repository-sync-config-section">
        <h3 class="repository-sync-subtitle">Watched repositories</h3>

        <p class="repository-sync-config-label">Workspace repositories</p>
        {repositorySyncConfig.workspaceRepositories.length > 0 ? (
          <ul class="repository-sync-path-list">
            {repositorySyncConfig.workspaceRepositories.map((repository) => (
              <li key={`workspace-${repository.path}`} class="repository-sync-path-row">
                <div class="repository-sync-path-details">
                  <span class="repository-sync-path-name">{repository.name}</span>
                  <span class="repository-sync-path-text" title={repository.path}>
                    {repository.path}
                  </span>
                </div>
                <button
                  class="repository-sync-remove-btn"
                  title="Hide repository from workspace list"
                  aria-label={`Hide repository ${repository.path}`}
                  onClick={() => handleHideRepository(repository.path)}
                >
                  Hide
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="repository-sync-empty-text">No workspace repositories detected.</p>
        )}

        <p class="repository-sync-config-label">Hidden repositories</p>
        {repositorySyncConfig.hiddenRepositories.length > 0 ? (
          <ul class="repository-sync-path-list">
            {repositorySyncConfig.hiddenRepositories.map((hiddenPath) => (
              <li key={`hidden-${hiddenPath}`} class="repository-sync-path-row">
                <span class="repository-sync-path-text" title={hiddenPath}>
                  {hiddenPath}
                </span>
                <button
                  class="repository-sync-remove-btn"
                  title="Show hidden repository"
                  aria-label={`Show hidden repository ${hiddenPath}`}
                  onClick={() => handleUnhideRepository(hiddenPath)}
                >
                  Show
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="repository-sync-empty-text">No hidden repositories.</p>
        )}

        <p class="repository-sync-config-label">Watched external repositories</p>
        {repositorySyncConfig.watchedRepositories.length > 0 ? (
          <ul class="repository-sync-path-list">
            {repositorySyncConfig.watchedRepositories.map((watchedPath) => (
              <li key={`watched-${watchedPath}`} class="repository-sync-path-row">
                <span class="repository-sync-path-text" title={watchedPath}>
                  {watchedPath}
                </span>
                <button
                  class="repository-sync-remove-btn"
                  title="Remove watched repository"
                  aria-label={`Remove watched repository ${watchedPath}`}
                  onClick={() => handleRemoveWatchedRepository(watchedPath)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="repository-sync-empty-text">No external watched repositories configured.</p>
        )}

        <button
          class="action-button"
          title="Browse and add watched repository"
          aria-label="Browse and add watched repository"
          onClick={handleBrowseAddWatchedRepository}
        >
          Browse/Add watched repository
        </button>
      </div>

      <div class="repository-sync-config-section">
        <h3 class="repository-sync-subtitle">Scan root folders</h3>

        {repositorySyncConfig.scanRootPaths.length > 0 ? (
          <ul class="repository-sync-path-list">
            {repositorySyncConfig.scanRootPaths.map((rootPath) => (
              <li key={`scan-root-${rootPath}`} class="repository-sync-path-row">
                <span class="repository-sync-path-text" title={rootPath}>
                  {rootPath}
                </span>
                <button
                  class="repository-sync-remove-btn"
                  title="Remove scan root folder"
                  aria-label={`Remove scan root folder ${rootPath}`}
                  onClick={() => handleRemoveScanRoot(rootPath)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="repository-sync-empty-text">No scan root folders configured.</p>
        )}

        <button
          class="action-button"
          title="Browse and add scan root folder"
          aria-label="Browse and add scan root folder"
          onClick={handleBrowseAddScanRoot}
        >
          Browse/Add scan root
        </button>
      </div>

      <div class="repository-sync-batch-action">
        <h3 class="repository-sync-subtitle">Batch conflict action</h3>
        <p class="repository-sync-batch-helper-text">Use a matching pair: workspace conflict with workspace actions, external conflict with external repository actions.</p>
        <div class="repository-sync-select-grid">
          <div class="workflow-field">
            <label class="workflow-label" for="repository-sync-conflict-group">Conflict group</label>
            <select
              id="repository-sync-conflict-group"
              class="workflow-select"
              title="Select the conflict group to target"
              aria-label="Conflict group for batch action"
              value={conflictGroup}
              onChange={(e) => handleConflictGroupChange((e.target as HTMLSelectElement).value)}
            >
              <option value="">-- Select conflict group --</option>
              {CONFLICT_GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div class="workflow-field">
            <label class="workflow-label" for="repository-sync-conflict-action">Action</label>
            <select
              id="repository-sync-conflict-action"
              class="workflow-select"
              title="Select the action to apply to the selected conflict group"
              aria-label="Batch action for selected conflict group"
              value={action}
              disabled={!conflictGroup}
              onChange={(e) => setAction((e.target as HTMLSelectElement).value as RepositorySyncActionType | "")}
            >
              <option value="">-- Select action --</option>
              {actionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          class="action-button repository-sync-apply-btn"
          title="Apply the selected conflict action to all conflicts in the selected group"
          aria-label="Apply batch conflict action"
          onClick={handleApplyBatchConflictAction}
          disabled={!canApplyBatchAction}
        >
          Apply batch action
        </button>
      </div>
    </div>
  );
}
