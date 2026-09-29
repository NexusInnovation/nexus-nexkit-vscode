import {
  SquadBacklogDetectionSource,
  SquadBacklogProviderId,
  type SquadBacklogDetection,
  type SquadBacklogInfo,
} from "../../../../squad/models";
import type { SquadBacklogState } from "../../types/squadState";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";

interface SquadBacklogStatusSectionProps {
  /** Current backlog detection state. */
  backlog: SquadBacklogState;

  /** Request a fresh backlog detection. */
  onRefresh: () => void;

  /** Disable actions while a broader Squad operation is running. */
  disabled: boolean;
}

/** Provider display labels for the supported v1 backlog platforms. */
const PROVIDER_LABEL: Record<SquadBacklogProviderId, string> = {
  [SquadBacklogProviderId.GitHub]: "GitHub Issues",
  [SquadBacklogProviderId.AzureDevOps]: "Azure DevOps",
};

/** Render the SQD-044 backlog status card for GitHub Issues / Azure DevOps. */
export function SquadBacklogStatusSection({ backlog, onRefresh, disabled }: SquadBacklogStatusSectionProps) {
  const busy = backlog.isLoading;

  return (
    <section class="squad-backlog" aria-busy={busy}>
      <div class="squad-backlog-header">
        <div>
          <h3 class="squad-backlog-title">Backlog</h3>
          <p class="squad-backlog-subtitle">GitHub Issues and Azure DevOps are supported in v1.</p>
        </div>
        <button
          class="squad-refresh-button"
          onClick={onRefresh}
          disabled={disabled || busy}
          title="Refresh Squad backlog status"
          aria-label="Refresh Squad backlog status"
        >
          <i class={`codicon codicon-refresh${busy ? " codicon-modifier-spin" : ""}`} aria-hidden="true"></i>
        </button>
      </div>

      {renderBacklogBody(backlog.detection, backlog.error, busy)}

      <p class="squad-backlog-v1-note">
        GitHub Projects is planned but not enabled in v1. Jira is deferred and not natively supported.
      </p>
    </section>
  );
}

function renderBacklogBody(detection: SquadBacklogDetection | null, error: SquadBacklogState["error"], busy: boolean) {
  if (error) {
    return (
      <div class="squad-backlog-body squad-backlog-error-state">
        <span class="squad-backlog-status squad-backlog-status-error">
          <i class="codicon codicon-error" aria-hidden="true"></i> Needs attention
        </span>
        <SquadErrorNotice error={error} />
      </div>
    );
  }

  if (busy && !detection) {
    return (
      <div class="squad-backlog-body squad-backlog-loading">
        <span class="squad-backlog-status squad-backlog-status-loading">
          <i class="codicon codicon-loading codicon-modifier-spin" aria-hidden="true"></i> Checking backlog...
        </span>
      </div>
    );
  }

  if (!detection) {
    return <p class="squad-backlog-empty">Backlog status has not been checked yet.</p>;
  }

  if (detection.status === "not-detected") {
    return (
      <div class="squad-backlog-body squad-backlog-not-detected-state">
        <span class="squad-backlog-status squad-backlog-status-not-detected">
          <i class="codicon codicon-info" aria-hidden="true"></i> Not detected
        </span>
        <p class="squad-backlog-message">{detection.message}</p>
        <p class="squad-backlog-remediation">{detection.remediation}</p>
      </div>
    );
  }

  return <DetectedBacklog backlog={detection.backlog} />;
}

function DetectedBacklog({ backlog }: { backlog: SquadBacklogInfo }) {
  const providerLabel = PROVIDER_LABEL[backlog.providerId];

  return (
    <div class="squad-backlog-body squad-backlog-detected-state">
      <span class="squad-backlog-status squad-backlog-status-detected">
        <i class="codicon codicon-pass" aria-hidden="true"></i> Detected
      </span>

      <dl class="squad-backlog-grid">
        <div class="squad-backlog-item">
          <dt>Provider</dt>
          <dd>{providerLabel}</dd>
        </div>
        <div class="squad-backlog-item">
          <dt>Status</dt>
          <dd>{backlog.readOnly ? "Read-only" : "Writable"}</dd>
        </div>
        <div class="squad-backlog-item squad-backlog-item-wide">
          <dt>Name</dt>
          <dd>{backlog.url ? <a href={backlog.url}>{backlog.displayName}</a> : backlog.displayName}</dd>
        </div>
        <div class="squad-backlog-item">
          <dt>Source</dt>
          <dd>{sourceLabel(backlog.source)}</dd>
        </div>
        {backlog.remoteName && (
          <div class="squad-backlog-item">
            <dt>Remote</dt>
            <dd>{backlog.remoteName}</dd>
          </div>
        )}
      </dl>

      <dl class="squad-backlog-counts">
        <div>
          <dt>Open</dt>
          <dd>{formatCount(backlog.itemCounts.open)}</dd>
        </div>
        <div>
          <dt>Squad</dt>
          <dd>{formatCount(backlog.itemCounts.squad)}</dd>
        </div>
        <div>
          <dt>Untriaged</dt>
          <dd>{formatCount(backlog.itemCounts.untriaged)}</dd>
        </div>
      </dl>

      {backlog.github && (
        <p class="squad-backlog-detail">
          <span>Repository:</span> {backlog.github.host}/{backlog.github.owner}/{backlog.github.repo}
        </p>
      )}

      {backlog.azureDevOps && (
        <div class="squad-backlog-detail-list">
          <p>
            <span>Project:</span> {backlog.azureDevOps.organization}/{backlog.azureDevOps.project}
          </p>
          {backlog.azureDevOps.defaultWorkItemType && (
            <p>
              <span>Default type:</span> {backlog.azureDevOps.defaultWorkItemType}
            </p>
          )}
          {backlog.azureDevOps.areaPath && (
            <p>
              <span>Area:</span> {backlog.azureDevOps.areaPath}
            </p>
          )}
          {backlog.azureDevOps.iterationPath && (
            <p>
              <span>Iteration:</span> {backlog.azureDevOps.iterationPath}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function sourceLabel(source: SquadBacklogDetectionSource): string {
  return source === SquadBacklogDetectionSource.Config ? ".squad/config.json" : "Git remote";
}

function formatCount(count: number | null): string {
  return count === null ? "Unknown" : String(count);
}
