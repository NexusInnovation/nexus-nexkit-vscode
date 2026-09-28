import { useEffect, useState } from "preact/hooks";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { GitHooksStatusData } from "../../../types/gitHooksMessages";

/**
 * GitHooksSection Component
 * Displays git hooks status and provides controls for setup, sync, enable/disable
 */
export function GitHooksSection() {
  const messenger = useVSCodeAPI();
  const [status, setStatus] = useState<GitHooksStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request status when component mounts
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    messenger.sendMessage({ command: "getGitHooksStatus" });
  };

  const handleSetup = (): void => {
    setLoading(true);
    setError(null);
    messenger.sendMessage({ command: "setupGitHooks" });
  };

  const handleSync = (): void => {
    setLoading(true);
    setError(null);
    messenger.sendMessage({ command: "syncGitHooksFromGithub" });
  };

  const handleToggle = (): void => {
    setLoading(true);
    setError(null);
    if (status?.isEnabled) {
      messenger.sendMessage({ command: "disableGitHooks" });
    } else {
      messenger.sendMessage({ command: "enableGitHooks" });
    }
  };

  // Listen for status updates from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.command === "gitHooksStatusUpdate") {
        setStatus(message.status);
        setLoading(false);
      } else if (message.command === "gitHooksOperationComplete") {
        setLoading(false);
        if (message.success) {
          // Reload status after operation
          loadStatus();
        } else if (message.message) {
          setError(message.message);
        }
      } else if (message.command === "gitHooksError") {
        setError(message.error);
        setLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Determine button states based on status
  const setupButtonDisabled = loading || status?.isInstalled || !status?.pythonAvailable;
  const syncButtonDisabled = loading || !status?.isInstalled;
  const toggleButtonDisabled = loading || !status?.isInstalled;

  return (
    <CollapsibleSection id="tools-git-hooks" title="Git Hooks">
      <div class="git-hooks-section">
        {/* Status Display */}
        <div class="status-container">
          {status && (
            <>
              <div class="status-item">
                <span class="status-label">Status:</span>
                <span class={`status-value ${status.isInstalled ? "installed" : "not-installed"}`}>
                  {status.isInstalled ? "✅ Installed" : "❌ Not Installed"}
                </span>
              </div>

              <div class="status-item">
                <span class="status-label">Enabled:</span>
                <span class={`status-value ${status.isEnabled ? "enabled" : "disabled"}`}>
                  {status.isEnabled ? "✅ Yes" : "⛔ No"}
                </span>
              </div>

              <div class="status-item">
                <span class="status-label">Rules Loaded:</span>
                <span class="status-value">{status.rulesLoaded}</span>
              </div>

              <div class="status-item">
                <span class="status-label">Python:</span>
                <span class={`status-value ${status.pythonAvailable ? "available" : "unavailable"}`}>
                  {status.pythonAvailable ? "✅ Available" : "❌ Not Found"}
                </span>
              </div>

              {status.message && (
                <div class="status-message">
                  <span>{status.message}</span>
                </div>
              )}
            </>
          )}

          {!status && (
            <div class="status-loading">
              <span>Loading status...</span>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div class="error-message">
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div class="buttons-container">
          {!status?.isInstalled && (
            <button
              class="action-button"
              onClick={handleSetup}
              disabled={setupButtonDisabled}
              title={
                !status?.pythonAvailable
                  ? "Python is required to setup git hooks"
                  : status?.isInstalled
                    ? "Git hooks already installed"
                    : "Install git hooks"
              }
            >
              {loading ? "Setting up..." : "Setup / Install"}
            </button>
          )}

          {status?.isInstalled && (
            <>
              <button
                class="action-button"
                onClick={handleSync}
                disabled={syncButtonDisabled}
                title="Sync rules from GitHub repository"
              >
                {loading ? "Syncing..." : "Sync from GitHub"}
              </button>

              <button
                class="action-button"
                onClick={handleToggle}
                disabled={toggleButtonDisabled}
                title={status.isEnabled ? "Disable git hooks validation" : "Enable git hooks validation"}
              >
                {loading ? "Updating..." : status.isEnabled ? "Disable" : "Enable"}
              </button>
            </>
          )}
        </div>

        {/* Python availability note */}
        {!status?.pythonAvailable && !status?.isInstalled && (
          <div class="info-note">
            <span>
              ℹ️ Python is required for git hooks. Please install Python and add it to your PATH, then try again.
            </span>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
