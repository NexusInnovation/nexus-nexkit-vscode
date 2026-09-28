import { SquadError } from "../../../../squad/models";

interface SquadErrorNoticeProps {
  /** Structured, actionable Squad error to surface. */
  error: SquadError;
}

/**
 * SquadErrorNotice Component
 *
 * Renders a Squad {@link SquadError} as a visible, actionable notice. Failures
 * must never look like an empty success, so the message and its remediation are
 * always shown (FR-022/024/025 error handling).
 */
export function SquadErrorNotice({ error }: SquadErrorNoticeProps) {
  return (
    <div class="squad-error" role="alert">
      <div class="squad-error-header">
        <i class="codicon codicon-error" aria-hidden="true"></i>
        <span class="squad-error-message">{error.message}</span>
      </div>
      {error.remediation && <p class="squad-error-remediation">{error.remediation}</p>}
      {error.detail && <p class="squad-error-detail">{error.detail}</p>}
    </div>
  );
}
