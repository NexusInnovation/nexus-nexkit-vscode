import { useEffect, useState } from "preact/hooks";
import { useSquadState } from "../../hooks/useSquadState";
import {
  SQUAD_WATCH_DEFAULT_INTERVAL_MINUTES,
  SQUAD_WATCH_MAX_INTERVAL_MINUTES,
  SQUAD_WATCH_MIN_INTERVAL_MINUTES,
  SquadWatchState,
} from "../../../../squad/models";
import type { SquadWatchLogEntry, SquadWatchStatus } from "../../../../squad/models";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";

const WATCH_STATE_META: Record<SquadWatchState, { label: string; icon: string; description: string }> = {
  [SquadWatchState.Stopped]: {
    label: "Stopped",
    icon: "debug-stop",
    description: "Squad watch is idle. Start it to monitor Squad drift.",
  },
  [SquadWatchState.Starting]: {
    label: "Starting",
    icon: "loading codicon-modifier-spin",
    description: "Squad watch is starting and waiting for the process to stay healthy.",
  },
  [SquadWatchState.Running]: {
    label: "Running",
    icon: "pass",
    description: "Squad watch is running and streaming health logs.",
  },
  [SquadWatchState.Stopping]: {
    label: "Stopping",
    icon: "loading codicon-modifier-spin",
    description: "Squad watch is stopping.",
  },
  [SquadWatchState.Failed]: {
    label: "Failed",
    icon: "error",
    description: "Squad watch failed. Review the error and latest logs before restarting.",
  },
};

function formatTimestamp(value: number | null): string {
  if (value === null) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

function formatLogTime(value: number): string {
  return new Date(value).toLocaleTimeString();
}

function formatInterval(intervalMinutes: number | null): string {
  return intervalMinutes === null ? "Default" : `${intervalMinutes} min`;
}

function formatExit(status: SquadWatchStatus): string {
  if (status.exitCode !== null) {
    return `Code ${status.exitCode}`;
  }

  if (status.signal !== null) {
    return `Signal ${status.signal}`;
  }

  return status.stoppedAt === null ? "Not available" : "Clean exit";
}

function parseInterval(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return undefined;
  }

  return parsed;
}

function intervalValidationMessage(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const parsed = parseInterval(trimmed);
  if (parsed === undefined || parsed < SQUAD_WATCH_MIN_INTERVAL_MINUTES || parsed > SQUAD_WATCH_MAX_INTERVAL_MINUTES) {
    return `Enter a whole number from ${SQUAD_WATCH_MIN_INTERVAL_MINUTES} to ${SQUAD_WATCH_MAX_INTERVAL_MINUTES}.`;
  }

  return null;
}

function SquadWatchLogLine({ entry }: { entry: SquadWatchLogEntry }) {
  return (
    <li class={`squad-watch-log-line squad-watch-log-${entry.stream}`}>
      <span class="squad-watch-log-time">{formatLogTime(entry.timestamp)}</span>
      <span class="squad-watch-log-stream">{entry.stream}</span>
      <span class="squad-watch-log-text">{entry.text}</span>
    </li>
  );
}

/**
 * SquadWatchSection Component (SQD-046, FR-028 / FR-054)
 *
 * Renders the managed `squad watch` lifecycle snapshot produced by the host:
 * health state, key process details, retained log stream and explicit
 * start/stop actions. State comes from AppState via {@link useSquadState};
 * live updates are handled only by `AppStateContext`.
 */
export function SquadWatchSection() {
  const { watch, getWatchStatus, startWatch, stopWatch } = useSquadState();
  const [intervalInput, setIntervalInput] = useState(
    String(watch.status.intervalMinutes ?? SQUAD_WATCH_DEFAULT_INTERVAL_MINUTES)
  );

  useEffect(() => {
    getWatchStatus();
  }, []);

  const { status, logs } = watch;
  const stateMeta = WATCH_STATE_META[status.state];
  const intervalError = intervalValidationMessage(intervalInput);
  const parsedInterval = parseInterval(intervalInput);
  const canStart = status.state === SquadWatchState.Stopped || status.state === SquadWatchState.Failed;
  const canStop =
    status.state === SquadWatchState.Starting ||
    status.state === SquadWatchState.Running ||
    status.state === SquadWatchState.Stopping;

  const handleStart = (event: Event) => {
    event.preventDefault();
    if (intervalError) {
      return;
    }
    startWatch(parsedInterval);
  };

  return (
    <div class="squad-watch">
      <div class="squad-watch-health">
        <div class="squad-watch-health-main">
          <span class={`squad-watch-badge squad-watch-${status.state}`}>
            <i class={`codicon codicon-${stateMeta.icon}`} aria-hidden="true"></i> {stateMeta.label}
          </span>
          <p class="squad-watch-description">{stateMeta.description}</p>
        </div>
        <button class="squad-refresh-button" onClick={getWatchStatus} title="Refresh Squad watch status">
          <i class="codicon codicon-refresh" aria-hidden="true"></i> Refresh
        </button>
      </div>

      {status.error && <SquadErrorNotice error={status.error} />}

      <dl class="squad-watch-grid">
        <div class="squad-watch-item">
          <dt>Interval</dt>
          <dd>{formatInterval(status.intervalMinutes)}</dd>
        </div>
        <div class="squad-watch-item">
          <dt>Started</dt>
          <dd>{formatTimestamp(status.startedAt)}</dd>
        </div>
        <div class="squad-watch-item">
          <dt>Stopped</dt>
          <dd>{formatTimestamp(status.stoppedAt)}</dd>
        </div>
        <div class="squad-watch-item">
          <dt>Last exit</dt>
          <dd>{formatExit(status)}</dd>
        </div>
        <div class="squad-watch-item">
          <dt>Log lines</dt>
          <dd>{status.logLineCount}</dd>
        </div>
        <div class="squad-watch-item">
          <dt>Dropped</dt>
          <dd>{status.droppedLogLines}</dd>
        </div>
      </dl>

      <form class="squad-watch-actions" onSubmit={handleStart}>
        <label class="squad-watch-interval">
          <span>Polling interval</span>
          <input
            type="number"
            min={SQUAD_WATCH_MIN_INTERVAL_MINUTES}
            max={SQUAD_WATCH_MAX_INTERVAL_MINUTES}
            step={1}
            value={intervalInput}
            aria-invalid={intervalError ? "true" : "false"}
            aria-describedby={intervalError ? "squad-watch-interval-error" : undefined}
            disabled={!canStart}
            onInput={(event) => setIntervalInput((event.target as HTMLInputElement).value)}
          />
        </label>
        <button class="squad-watch-start-button" type="submit" disabled={!canStart || intervalError !== null}>
          <i class="codicon codicon-play" aria-hidden="true"></i> Start watch
        </button>
        <button class="squad-watch-stop-button" type="button" disabled={!canStop} onClick={() => stopWatch()}>
          <i class="codicon codicon-debug-stop" aria-hidden="true"></i> Stop
        </button>
        <button class="squad-watch-force-button" type="button" disabled={!canStop} onClick={() => stopWatch(true)}>
          <i class="codicon codicon-debug-disconnect" aria-hidden="true"></i> Force stop
        </button>
      </form>

      {intervalError && (
        <p class="squad-watch-validation" id="squad-watch-interval-error" role="alert">
          {intervalError}
        </p>
      )}

      <div class="squad-watch-log">
        <div class="squad-watch-log-header">
          <span class="squad-watch-log-title">Live log stream</span>
          {status.droppedLogLines > 0 && (
            <span class="squad-watch-dropped">
              <i class="codicon codicon-warning" aria-hidden="true"></i> {status.droppedLogLines} older lines dropped
            </span>
          )}
        </div>

        {logs.length === 0 ? (
          <p class="empty-message">No squad watch log lines captured yet.</p>
        ) : (
          <ol class="squad-watch-log-stream-list" aria-label="Squad watch log stream">
            {logs.map((entry) => (
              <SquadWatchLogLine key={entry.seq} entry={entry} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
