import { useState } from "preact/hooks";
import { useSquadState } from "../../hooks/useSquadState";
import { SkeletonList } from "../atoms/Skeleton";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { SquadMarkdownView } from "../molecules/SquadMarkdownView";
import { SquadLogDocument, SquadLogKind } from "../../types/squadState";
import { baseName, formatBytes, truncationNotice } from "../../utils/squadFormat";

/** Display metadata for each log stream, in render order. */
const LOG_GROUPS: ReadonlyArray<{ kind: SquadLogKind; title: string; icon: string }> = [
  { kind: SquadLogKind.AgentHistory, title: "Agent histories", icon: "codicon-history" },
  { kind: SquadLogKind.Log, title: "Session logs", icon: "codicon-output" },
  { kind: SquadLogKind.Orchestration, title: "Orchestration logs", icon: "codicon-server-process" },
];

interface SquadLogEntryProps {
  log: SquadLogDocument;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * A single expandable, read-only log entry. Shows a truncation notice when the
 * host capped the read (FR-025).
 */
function SquadLogEntry({ log, isOpen, onToggle }: SquadLogEntryProps) {
  const label = log.agentId ? `${log.agentId} — ${baseName(log.relativePath)}` : baseName(log.relativePath);
  const notice = truncationNotice(log.truncated, log.sizeBytes);

  return (
    <div class={`squad-log-entry${isOpen ? " open" : ""}`}>
      <button class="squad-log-header" onClick={onToggle} aria-expanded={isOpen} title={log.relativePath}>
        <i class={`codicon ${isOpen ? "codicon-chevron-down" : "codicon-chevron-right"}`} aria-hidden="true"></i>
        <span class="squad-log-name">{label}</span>
        {log.sizeBytes !== undefined && <span class="squad-log-size">{formatBytes(log.sizeBytes)}</span>}
        {log.truncated && <span class="squad-log-badge" title="Truncated for display">truncated</span>}
      </button>
      {isOpen && (
        <div class="squad-log-body">
          {notice && (
            <p class="squad-truncation-notice" role="note">
              <i class="codicon codicon-info" aria-hidden="true"></i> {notice}
            </p>
          )}
          <SquadMarkdownView content={log.content} ariaLabel={label} emptyMessage="This file is empty." />
        </div>
      )}
    </div>
  );
}

/**
 * SquadLogSection Component (SQD-014, FR-025)
 *
 * Read-only, purely presentational viewer for agent histories, session logs and
 * orchestration logs, grouped by kind. Content is size-limited by the host
 * ({@link truncationNotice}); a visible notice is shown when a file was
 * truncated for display. State comes from the Squad AppState slice via
 * {@link useSquadState}; loading, empty and error states are shown explicitly.
 */
export function SquadLogSection() {
  const { isReady, isLoading, error, logs } = useSquadState();
  const [openPath, setOpenPath] = useState<string | null>(null);

  const toggle = (relativePath: string) => {
    setOpenPath((current) => (current === relativePath ? null : relativePath));
  };

  return (
    <div class="squad-logs">
      {error && <SquadErrorNotice error={error} />}

      {!isReady && !error && <SkeletonList label="Loading logs" rows={4} />}

      {isReady && isLoading && <p class="loading">Refreshing logs…</p>}

      {isReady && !error && logs.length === 0 && (
        <p class="empty-message">No agent histories or logs found under <code>.squad/</code>.</p>
      )}

      {isReady &&
        logs.length > 0 &&
        LOG_GROUPS.map((group) => {
          const groupLogs = logs.filter((log) => log.kind === group.kind);
          if (groupLogs.length === 0) {
            return null;
          }
          return (
            <div key={group.kind} class="squad-log-group">
              <h3 class="squad-log-group-title">
                <i class={`codicon ${group.icon}`} aria-hidden="true"></i> {group.title} ({groupLogs.length})
              </h3>
              {groupLogs.map((log) => (
                <SquadLogEntry
                  key={log.relativePath}
                  log={log}
                  isOpen={openPath === log.relativePath}
                  onToggle={() => toggle(log.relativePath)}
                />
              ))}
            </div>
          );
        })}
    </div>
  );
}
