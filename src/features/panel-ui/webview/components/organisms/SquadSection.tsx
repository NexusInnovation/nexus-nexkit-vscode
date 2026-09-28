import { useEffect } from "preact/hooks";
import { useSquadState } from "../../hooks/useSquadState";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { SquadStatusSection } from "./SquadStatusSection";
import { SquadRosterSection } from "./SquadRosterSection";
import { SquadGovernanceSection } from "./SquadGovernanceSection";
import { SquadLogSection } from "./SquadLogSection";
import { SquadInstallState } from "../../../../squad/models";

/**
 * Guidance shown when no Squad markers are present in the workspace.
 *
 * The "initialise from a preset" action is delivered separately (#234 / #235);
 * a slot is reserved here without faking a non-functional control.
 */
function SquadNotDetectedNotice() {
  return (
    <div class="squad-not-detected info-message">
      <p>
        <i class="codicon codicon-info" aria-hidden="true"></i> Squad is not initialised in this workspace.
      </p>
      <p>
        NexKit looks for markers such as <code>.squad/team.md</code>, <code>.squad/config.json</code> or{" "}
        <code>.github/agents/squad.agent.md</code>. Add these files to manage your team, roster and governance here.
      </p>
      <p class="squad-init-slot-note">Initialise from a preset — coming soon.</p>
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
          <p class="loading">Detecting Squad…</p>
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
