import { useState } from "preact/hooks";
import { useSquadState } from "../../hooks/useSquadState";
import { SquadCliSource, SquadInstallState } from "../../../../squad/models";
import {
  describeCliVersion,
  describeProjectVersion,
  doctorSeverityCodicon,
  doctorSeverityLabel,
  doctorSummary,
  ProjectVersionKind,
} from "../../utils/squadStatusFormat";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";

/** Human-readable label for each aggregate install state (FR-021). */
const INSTALL_LABEL: Record<SquadInstallState, string> = {
  [SquadInstallState.Installed]: "Installed",
  [SquadInstallState.Partial]: "Partially installed",
  [SquadInstallState.NotInstalled]: "Not installed",
};

/** Sub-label clarifying the meaning of a project version kind (FR-002). */
const PROJECT_VERSION_KIND_HINT: Record<ProjectVersionKind, string | null> = {
  pinned: null,
  source: "tracked from source",
  unknown: "no version stamp found",
};

/** A small pill indicating that a newer version is available (FR-005). */
function UpdatePill() {
  return (
    <span class="squad-update-pill" title="A newer version is available">
      <i class="codicon codicon-arrow-circle-up" aria-hidden="true"></i> update available
    </span>
  );
}

/** npm package that provides the Squad CLI executable (FR-004). */
const SQUAD_CLI_PACKAGE = "@bradygaster/squad-cli";

/**
 * Interactive diagnostic shown when the Squad CLI is not detected (FR-004, SQD-025).
 *
 * Presents the three supported invocation strategies as actionable choices,
 * matching the SQD-002 `nexkit.squad.cliSource` setting:
 *  - install globally via npm (host confirms, then runs the command in a
 *    terminal — never silently),
 *  - run on demand with npx,
 *  - point NexKit at a custom executable path.
 *
 * Purely presentational: the local input holds only transient form state; the
 * actual persistence and terminal handling live in the host handler, reached
 * through {@link useSquadState} action callbacks.
 */
function SquadCliMissingNotice({
  onInstallGlobal,
  onUseNpx,
  onSetCustomPath,
  disabled,
}: {
  onInstallGlobal: () => void;
  onUseNpx: () => void;
  onSetCustomPath: (cliPath: string) => void;
  disabled: boolean;
}) {
  const [customPath, setCustomPath] = useState("");
  const trimmedPath = customPath.trim();

  return (
    <div class="squad-cli-missing info-message">
      <p class="squad-cli-missing-lead">
        <i class="codicon codicon-warning" aria-hidden="true"></i> The Squad CLI was not detected.
      </p>
      <p>Choose how NexKit should run the Squad CLI:</p>
      <ul class="squad-cli-options">
        <li class="squad-cli-option">
          <div class="squad-cli-option-body">
            <span class="squad-cli-option-title">Install globally with npm</span>
            <p class="squad-cli-option-desc">Install the CLI once and run it directly.</p>
            <code class="squad-cli-command">npm install -g {SQUAD_CLI_PACKAGE}@latest</code>
          </div>
          <button
            class="squad-cli-option-action"
            onClick={onInstallGlobal}
            disabled={disabled}
            title="Install the Squad CLI globally (asks for confirmation, then runs in a terminal)"
          >
            <i class="codicon codicon-cloud-download" aria-hidden="true"></i> Install with npm
          </button>
        </li>
        <li class="squad-cli-option">
          <div class="squad-cli-option-body">
            <span class="squad-cli-option-title">Use npx (no install)</span>
            <p class="squad-cli-option-desc">Run the CLI on demand. No global install required.</p>
            <code class="squad-cli-command">npx {SQUAD_CLI_PACKAGE}</code>
          </div>
          <button
            class="squad-cli-option-action"
            onClick={onUseNpx}
            disabled={disabled}
            title="Configure NexKit to invoke the Squad CLI via npx"
          >
            <i class="codicon codicon-check" aria-hidden="true"></i> Use npx
          </button>
        </li>
        <li class="squad-cli-option">
          <div class="squad-cli-option-body">
            <span class="squad-cli-option-title">Use a custom path</span>
            <p class="squad-cli-option-desc">Point NexKit at an existing Squad executable.</p>
            <input
              class="squad-cli-path-input"
              type="text"
              value={customPath}
              placeholder="Path to the squad executable"
              aria-label="Custom Squad CLI path"
              disabled={disabled}
              onInput={(event) => setCustomPath((event.target as HTMLInputElement).value)}
            />
          </div>
          <button
            class="squad-cli-option-action"
            onClick={() => onSetCustomPath(trimmedPath)}
            disabled={disabled || trimmedPath === ""}
            title="Use the entered path as the Squad CLI"
          >
            <i class="codicon codicon-folder-opened" aria-hidden="true"></i> Use this path
          </button>
        </li>
      </ul>
    </div>
  );
}

/**
 * SquadStatusSection Component (SQD-010, FR-021 / FR-002 / FR-003 / FR-060)
 *
 * Purely presentational status & diagnostics header for the Squad tab: aggregate
 * install state, project version (pinned / source / unknown), CLI version and
 * availability, update-available hints (only when comparable data exists),
 * upstream/plugin counts, an explicit CLI-missing state (with a reserved slot for
 * the #240 invocation chooser), and a Squad Doctor trigger plus a structured
 * diagnostics list. All state and side effects live in {@link useSquadState};
 * this component renders nothing until the first detection snapshot arrives.
 */
export function SquadStatusSection() {
  const { detection, isLoading, upstreams, plugins, refreshDetection, doctor, runDoctor, error, setCliInvocation, installCli } =
    useSquadState();

  if (!detection) {
    return null;
  }

  const { project, cli } = detection;
  const installState = project.installState;
  const projectVersion = describeProjectVersion(project.projectVersion, project.versionStatus);
  const projectVersionHint = PROJECT_VERSION_KIND_HINT[projectVersion.kind];
  const cliVersion = describeCliVersion(cli);
  const doctorError = error && error.code === "doctor-failed" ? error : null;

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
          <dd class={`squad-version squad-version-${projectVersion.kind}`}>
            <span class="squad-version-value">{projectVersion.label}</span>
            {projectVersion.updateAvailable && <UpdatePill />}
            {projectVersionHint && <span class="squad-version-hint">{projectVersionHint}</span>}
          </dd>
        </div>
        <div class="squad-status-item">
          <dt>CLI version</dt>
          <dd class={`squad-version squad-version-${cliVersion.available ? "pinned" : "unknown"}`}>
            <span class="squad-version-value">{cliVersion.label}</span>
            {cliVersion.updateAvailable && <UpdatePill />}
            {cliVersion.sourceLabel && <span class="squad-version-hint">via {cliVersion.sourceLabel}</span>}
          </dd>
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

      {!cli.installed && (
        <SquadCliMissingNotice
          disabled={isLoading}
          onInstallGlobal={installCli}
          onUseNpx={() => setCliInvocation(SquadCliSource.Npx)}
          onSetCustomPath={(cliPath) => setCliInvocation(SquadCliSource.Custom, cliPath)}
        />
      )}

      <div class="squad-diagnostics">
        <div class="squad-diagnostics-header">
          <span class="squad-diagnostics-title">Diagnostics</span>
          <button
            class="squad-doctor-button"
            onClick={runDoctor}
            disabled={isLoading}
            title="Run Squad Doctor diagnostics"
          >
            <i
              class={`codicon codicon-${isLoading ? "loading codicon-modifier-spin" : "pulse"}`}
              aria-hidden="true"
            ></i>{" "}
            Run Doctor
          </button>
        </div>

        {doctorError ? (
          <SquadErrorNotice error={doctorError} />
        ) : doctor ? (
          <div class={`squad-doctor-report squad-doctor-${doctor.overall}`}>
            <p class="squad-doctor-summary">
              <i class={`codicon codicon-${doctorSeverityCodicon(doctor.overall)}`} aria-hidden="true"></i>{" "}
              {doctorSummary(doctor)}
              {!doctor.structured && <span class="squad-doctor-fallback"> (parsed from text output)</span>}
            </p>
            {doctor.checks.length > 0 && (
              <ul class="squad-diagnostics-list">
                {doctor.checks.map((check, index) => (
                  <li key={index} class={`squad-diagnostic squad-diagnostic-${check.severity}`}>
                    <div class="squad-diagnostic-head">
                      <i
                        class={`codicon codicon-${doctorSeverityCodicon(check.severity)}`}
                        aria-hidden="true"
                      ></i>
                      <span class="squad-diagnostic-label">{check.label}</span>
                      <span class="squad-diagnostic-severity">{doctorSeverityLabel(check.severity)}</span>
                    </div>
                    {check.message && <p class="squad-diagnostic-message">{check.message}</p>}
                    {check.remediation && <p class="squad-diagnostic-remediation">{check.remediation}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p class="squad-diagnostics-empty">
            Run Squad Doctor to check your workspace configuration and surface any issues.
          </p>
        )}
      </div>
    </div>
  );
}
