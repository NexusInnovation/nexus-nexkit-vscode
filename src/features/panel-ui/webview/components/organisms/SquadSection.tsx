import { useEffect } from "preact/hooks";
import { useSquadState } from "../../hooks/useSquadState";
import { SkeletonList } from "../atoms/Skeleton";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { SquadStatusSection } from "./SquadStatusSection";
import { SquadRosterSection } from "./SquadRosterSection";
import { SquadGovernanceSection } from "./SquadGovernanceSection";
import { SquadLogSection } from "./SquadLogSection";
import { SquadPresetPicker } from "./SquadPresetPicker";
import { SquadUpstreamSection } from "./SquadUpstreamSection";
import { SquadPluginsSection } from "./SquadPluginsSection";
import { SquadWorktreeSection } from "./SquadWorktreeSection";
import { SquadWatchSection } from "./SquadWatchSection";
import { SquadCeremonySection } from "./SquadCeremonySection";
import { SquadInstallState, SquadPersonalSquadState } from "../../../../squad/models";
import { useSquadPersonalSquad } from "../../hooks/useSquadPersonalSquad";

/**
 * Guidance shown when no Squad markers are present in the workspace.
 *
 * Presents the {@link SquadPresetPicker} (SQD-019 / #234) so the user can
 * initialise Squad from a team preset, alongside a short note about the marker
 * files NexKit looks for.
 */
function SquadNotDetectedNotice() {
  return (
    <div class="squad-not-detected">
      <p class="squad-not-detected-markers">
        <i class="codicon codicon-info" aria-hidden="true"></i> NexKit looks for markers such as <code>.squad/team.md</code>,{" "}
        <code>.squad/config.json</code> or <code>.github/agents/squad.agent.md</code>.
      </p>
      <PersonalSquadCard />
      <SquadPresetPicker />
    </div>
  );
}

/** Personal/global Squad entry point shown beside workspace initialization choices. */
function PersonalSquadCard() {
  const { loading, status, error, lastInitOk, refresh, initialize } = useSquadPersonalSquad();

  useEffect(() => {
    if (!status && !loading) {
      refresh();
    }
  }, []);

  const initialized = status?.state === SquadPersonalSquadState.Initialized;

  return (
    <div class="squad-personal-card info-message">
      <p>
        <i class="codicon codicon-account" aria-hidden="true"></i> Personal Squad
      </p>
      <p>
        {status?.warning ??
          "Personal Squad lives outside this workspace and can affect future Squad sessions for this user profile."}
      </p>
      {status ? (
        <p>
          Status:{" "}
          <strong>
            {initialized ? `initialized (${status.memberCount} member${status.memberCount === 1 ? "" : "s"})` : "not initialized"}
          </strong>{" "}
          in {status.targetLabel}.
        </p>
      ) : null}
      {error ? <SquadErrorNotice error={error} /> : null}
      {lastInitOk ? <p class="success-message">Personal Squad is ready.</p> : null}
      <div class="squad-preset-confirm-actions">
        <button class="squad-refresh-button" onClick={refresh} disabled={loading}>
          <i class="codicon codicon-refresh" aria-hidden="true"></i> Refresh personal status
        </button>
        <button class="squad-preset-init-button" onClick={initialize} disabled={loading || initialized}>
          <i class="codicon codicon-rocket" aria-hidden="true"></i> Initialize personal Squad
        </button>
      </div>
    </div>
  );
}

/**
 * SquadSection Component (SQD-009, FR-020)
 *
 * Container for the Squad tab in the NexKit panel. On first activation it
 * requests a Squad detection/data snapshot through the SQD-007 hook actions
 * ({@link useSquadState.refresh}); the host routing lives in SQD-008. Once a
 * snapshot arrives it shows the status header and, when Squad is detected,
 * mounts the read-only roster, governance and log sections. When no Squad
 * markers are found it shows explicit guidance with a reserved slot for the
 * future preset-initialisation action.
 *
 * Purely presentational: all side effects and state live in {@link useSquadState}.
 */
export function SquadSection() {
  const { isReady, isLoading, error, detection, refresh } = useSquadState();

  // Request the initial Squad snapshot when the tab is first activated.
  useEffect(() => {
    if (!isReady && !isLoading) {
      refresh();
    }
  }, []);

  if (!isReady) {
    return (
      <div class="squad-section">
        {error ? (
          <>
            <SquadErrorNotice error={error} />
            <button class="squad-retry-button" onClick={refresh}>
              <i class="codicon codicon-refresh" aria-hidden="true"></i> Retry detection
            </button>
          </>
        ) : (
          <SkeletonList label="Detecting Squad" rows={4} withHeader />
        )}
      </div>
    );
  }

  const installState = detection?.project.installState;
  const isDetected = installState === SquadInstallState.Installed || installState === SquadInstallState.Partial;

  return (
    <div class="squad-section">
      <SquadStatusSection />

      {isDetected ? (
        <>
          <CollapsibleSection id="squad-roster-section" title="Roster" defaultExpanded>
            <SquadRosterSection />
          </CollapsibleSection>
          <CollapsibleSection id="squad-upstreams-section" title="Upstreams" defaultExpanded>
            <SquadUpstreamSection />
          </CollapsibleSection>
          <CollapsibleSection id="squad-plugins-section" title="Plugins">
            <SquadPluginsSection />
          </CollapsibleSection>
          <CollapsibleSection id="squad-worktrees-section" title="Worktrees" defaultExpanded>
            <SquadWorktreeSection />
          </CollapsibleSection>
          <CollapsibleSection id="squad-watch-section" title="Watch health & logs" defaultExpanded>
            <SquadWatchSection />
          </CollapsibleSection>
          <CollapsibleSection id="squad-ceremonies-section" title="Ceremonies" defaultExpanded>
            <SquadCeremonySection />
          </CollapsibleSection>
          <CollapsibleSection id="squad-governance-section" title="Governance">
            <SquadGovernanceSection />
          </CollapsibleSection>
          <CollapsibleSection id="squad-logs-section" title="Logs & history">
            <SquadLogSection />
          </CollapsibleSection>
        </>
      ) : (
        <SquadNotDetectedNotice />
      )}
    </div>
  );
}
