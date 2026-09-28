import { useSquadState } from "../../hooks/useSquadState";
import { SquadInstallState, SquadVersionStatus } from "../../../../squad/models";

/** Human-readable label for each aggregate install state (FR-021). */
const INSTALL_LABEL: Record<SquadInstallState, string> = {
  [SquadInstallState.Installed]: "Installed",
  [SquadInstallState.Partial]: "Partially installed",
  [SquadInstallState.NotInstalled]: "Not installed",
};

/**
 * Render a version string with an explicit freshness suffix. `unknown` stays a
 * first-class state and is never coerced into a success (FR-002).
 */
function versionLabel(version: string | null, status: SquadVersionStatus): string {
  const base = version ?? "unknown";
  if (status === SquadVersionStatus.UpdateAvailable) {
    return `${base} (update available)`;
  }
  return base;
}

/**
 * SquadStatusSection Component (SQD-009, FR-021)
 *
 * Purely presentational status header for the Squad tab: aggregate install
 * state, project version, CLI version and upstream/plugin counts, sourced from
 * the Squad AppState slice via {@link useSquadState}. Exposes a refresh action
 * that re-runs detection through the host. Renders nothing until the first
 * detection snapshot arrives.
 */
export function SquadStatusSection() {
  const { detection, isLoading, upstreams, plugins, refreshDetection } = useSquadState();

  if (!detection) {
    return null;
  }

  const { project, cli } = detection;
  const installState = project.installState;

  return (
    <div class="squad-status">
      <div class="squad-status-header">
        <span class={`squad-status-badge squad-status-${installState}`}>{INSTALL_LABEL[installState]}</span>
        <button
          class="squad-refresh-button"
          onClick={refreshDetection}
          disabled={isLoading}
          title="Re-run Squad detection"
          aria-label="Refresh Squad detection"
        >
          <i class={`codicon codicon-refresh${isLoading ? " codicon-modifier-spin" : ""}`} aria-hidden="true"></i>
        </button>
      </div>

      <dl class="squad-status-grid">
        <div class="squad-status-item">
          <dt>Project version</dt>
          <dd>{versionLabel(project.projectVersion, project.versionStatus)}</dd>
        </div>
        <div class="squad-status-item">
          <dt>CLI</dt>
          <dd>{cli.installed ? versionLabel(cli.cliVersion, cli.versionStatus) : "not detected"}</dd>
        </div>
        <div class="squad-status-item">
          <dt>Upstreams</dt>
          <dd>{upstreams.length}</dd>
        </div>
        <div class="squad-status-item">
          <dt>Plugins</dt>
          <dd>{plugins.length}</dd>
        </div>
      </dl>
    </div>
  );
}
