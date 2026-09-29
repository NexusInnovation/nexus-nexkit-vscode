import { SquadErrorNotice } from "./SquadErrorNotice";
import type { SquadOperationFeedback } from "../../utils/squadUpstreamFormat";

interface SquadOperationFeedbackViewProps {
  /** Feedback to render. */
  feedback: SquadOperationFeedback;

  /** Retry handler for failed operations, when the operation can be re-run. */
  onRetry?: (() => void) | null;

  /** Disables the retry button (e.g. while another operation runs). */
  disabled?: boolean;
}

/**
 * SquadOperationFeedbackView (SQD-040)
 *
 * Presentational status line for the latest upstream / plugin operation.
 * Failures render as an actionable alert (message + remediation, optional
 * retry) and never as success; cancellations render as a neutral notice.
 */
export function SquadOperationFeedbackView({ feedback, onRetry, disabled }: SquadOperationFeedbackViewProps) {
  if (feedback.tone === "error" && feedback.error) {
    return (
      <div class="squad-operation-feedback squad-operation-feedback-error">
        <p class="squad-operation-feedback-title">{feedback.message}</p>
        <SquadErrorNotice error={feedback.error} />
        {onRetry && (
          <button class="squad-operation-retry" onClick={onRetry} disabled={disabled}>
            <i class="codicon codicon-refresh" aria-hidden="true"></i> Retry
          </button>
        )}
      </div>
    );
  }

  if (feedback.tone === "cancelled") {
    return (
      <div class="squad-operation-feedback squad-operation-feedback-cancelled" role="status">
        <i class="codicon codicon-circle-slash" aria-hidden="true"></i>{" "}
        <span class="squad-operation-feedback-message">{feedback.message}</span>
        {feedback.error?.remediation && <p class="squad-operation-feedback-hint">{feedback.error.remediation}</p>}
      </div>
    );
  }

  const icon = feedback.tone === "running" ? "loading codicon-modifier-spin" : "check";
  return (
    <div class={`squad-operation-feedback squad-operation-feedback-${feedback.tone}`} role="status">
      <i class={`codicon codicon-${icon}`} aria-hidden="true"></i>{" "}
      <span class="squad-operation-feedback-message">{feedback.message}</span>
    </div>
  );
}
