import {
  SquadUpstreamLevelStatus,
  SquadUpstreamRecommendations,
  SquadUpstreamWarning,
  SquadUpstreamWarningSeverity,
} from "../../../../squad/models";

interface SquadUpstreamRecommendationsViewProps {
  /** Recommendations evaluated by the host from `.squad/upstream.json`. */
  recommendations: SquadUpstreamRecommendations;
}

const LEVEL_STATUS_LABEL: Record<SquadUpstreamLevelStatus, string> = {
  [SquadUpstreamLevelStatus.Configured]: "Configured",
  [SquadUpstreamLevelStatus.Missing]: "Not configured",
};

function SquadUpstreamWarningItem({ warning }: { warning: SquadUpstreamWarning }) {
  const isWarning = warning.severity === SquadUpstreamWarningSeverity.Warning;
  return (
    <li
      class={`squad-upstream-warning squad-upstream-warning-${warning.severity}`}
      role={isWarning ? "alert" : "note"}
      data-code={warning.code}
    >
      <div class="squad-upstream-warning-header">
        <i class={`codicon ${isWarning ? "codicon-warning" : "codicon-info"}`} aria-hidden="true"></i>
        <span class="squad-upstream-warning-message">{warning.message}</span>
      </div>
      <p class="squad-upstream-warning-remediation">{warning.remediation}</p>
      {warning.alternatives && warning.alternatives.length > 0 && (
        <ul class="squad-upstream-warning-alternatives">
          {warning.alternatives.map((alternative) => (
            <li key={alternative}>{alternative}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * SquadUpstreamRecommendationsView (SQD-037, FR-033/FR-034/FR-035)
 *
 * Purely presentational: renders the recommended org → team → project
 * hierarchy, the preconfigured Nexus marketplace suggestion (with its reserved
 * folder) for each missing level, and every upstream warning with its
 * remediation — including the `squad upstream` full-clone / no sub-path risk.
 */
export function SquadUpstreamRecommendationsView({ recommendations }: SquadUpstreamRecommendationsViewProps) {
  const { levels, warnings, unclassifiedSourceIds } = recommendations;

  return (
    <div class="squad-upstream-recommendations">
      <h4 class="squad-upstream-recommendations-title">Recommended hierarchy</h4>
      <p class="squad-upstream-recommendations-hint">
        Inherit from the broadest level to the most specific: organization → team → project.
      </p>

      <ol class="squad-upstream-levels">
        {levels.map((level) => (
          <li key={level.level} class={`squad-upstream-level squad-upstream-level-${level.status}`} data-level={level.level}>
            <div class="squad-upstream-level-header">
              <span class="squad-upstream-level-label">{level.label}</span>
              <span class={`squad-upstream-level-status squad-upstream-level-status-${level.status}`}>
                {LEVEL_STATUS_LABEL[level.status]}
              </span>
            </div>
            <p class="squad-upstream-level-description">{level.description}</p>
            {level.status === SquadUpstreamLevelStatus.Configured ? (
              <p class="squad-upstream-level-sources">
                Sources:{" "}
                {level.sourceIds.map((id, index) => (
                  <span key={id}>
                    {index > 0 && ", "}
                    <code>{id}</code>
                  </span>
                ))}
              </p>
            ) : (
              <p class="squad-upstream-level-suggestion">
                Suggested: <code>{level.suggestion.repository}</code>, reserved folder{" "}
                <code>{level.suggestion.reservedFolder}</code>
                {!level.suggestion.subpathSupported && <> (add it as a JSON export; sub-paths are not supported)</>}
              </p>
            )}
          </li>
        ))}
      </ol>

      {unclassifiedSourceIds.length > 0 && (
        <p class="squad-upstream-unclassified">
          Free sources not mapped to a level:{" "}
          {unclassifiedSourceIds.map((id, index) => (
            <span key={id}>
              {index > 0 && ", "}
              <code>{id}</code>
            </span>
          ))}
        </p>
      )}

      {warnings.length > 0 && (
        <ul class="squad-upstream-warnings">
          {warnings.map((warning) => (
            <SquadUpstreamWarningItem key={`${warning.code}:${warning.sourceId ?? ""}`} warning={warning} />
          ))}
        </ul>
      )}
    </div>
  );
}
