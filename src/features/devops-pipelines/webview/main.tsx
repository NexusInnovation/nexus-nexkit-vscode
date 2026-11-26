import { Fragment, render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  BuildDetail,
  BuildStageDetail,
  BuildStatus,
  BuildSummary,
  HostToWebviewMessage,
  PipelineSummary,
  PipelinesViewState,
  RunOptions,
  StageState,
  StageSummary,
  WebviewToHostMessage,
} from "../messages";
import { durationBetween, formatRelativeTime } from "./format";
import { PlacedNode, layoutStageGraph } from "./graphLayout";

declare function acquireVsCodeApi(): { postMessage: (message: unknown) => void };

const vscode = acquireVsCodeApi();
const CLOCK_TICK_MS = 5_000;

type Filter = "all" | "running";
type Tab = "builds" | "pipelines";

function postToHost(message: WebviewToHostMessage): void {
  vscode.postMessage(message);
}

const ICON_GLYPHS: Partial<Record<BuildStatus | StageState, string>> = {
  succeeded: "✓",
  failed: "✕",
  warning: "!",
  partiallySucceeded: "!",
  canceled: "–",
  cancelling: "–",
  skipped: "»",
};

function StatusIcon({ status, size }: { status: BuildStatus | StageState; size?: "large" | "dot" }) {
  return (
    <span class={`icon ${status} ${size === "dot" ? "dot" : size === "large" ? "large" : ""}`} aria-label={status}>
      {size === "dot" ? "" : (ICON_GLYPHS[status] ?? "")}
    </span>
  );
}

function isActive(status: BuildStatus): boolean {
  return status === "queued" || status === "running" || status === "cancelling";
}

function StageDots({ stages }: { stages?: StageSummary[] }) {
  if (!stages) {
    return <div class="dots muted">…</div>;
  }
  return (
    <div class="dots">
      {stages.map((stage, index) => (
        <Fragment key={`${stage.name}-${index}`}>
          {index > 0 && <span class="link-line" />}
          <span title={`${stage.name}: ${stage.state}`}>
            <StatusIcon status={stage.state} size="dot" />
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function Avatar({ name, image }: { name: string; image?: string }) {
  return image ? (
    <img class="avatar" src={image} alt="" />
  ) : (
    <span class="avatar initials" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

const SVG_PROPS = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": true } as const;

const TriggerIcon = () => (
  <svg {...SVG_PROPS}>
    <path d="M2 2h5.6l6.4 6.4-5.6 5.6L2 7.6V2zm3 2a1 1 0 100 2 1 1 0 000-2z" />
  </svg>
);
const BranchIcon = () => (
  <svg {...SVG_PROPS}>
    <path d="M5 2.5a1.5 1.5 0 00-.75 2.8v5.4a1.5 1.5 0 101.5 0V8.5c.4.3.9.5 1.5.5h1.2c1.2 0 2-.6 2.2-1.6a1.5 1.5 0 10-1.5-.2c-.1.2-.3.3-.7.3H7.25c-.7 0-1.5-.5-1.5-1.2V5.3A1.5 1.5 0 005 2.5z" />
  </svg>
);
const PullRequestIcon = () => (
  <svg {...SVG_PROPS}>
    <path d="M4.5 2a1.5 1.5 0 00-.75 2.8v6.4a1.5 1.5 0 101.5 0V4.8A1.5 1.5 0 004.5 2zm6 7.2V5.5C10.5 4.7 9.8 4 9 4H8V2.5L5.8 4.7 8 7V5.5h1v3.7a1.5 1.5 0 101.5 0z" />
  </svg>
);
const CommitIcon = () => (
  <svg {...SVG_PROPS}>
    <path d="M8 5a3 3 0 013 3 3 3 0 01-3 3 3 3 0 01-3-3 3 3 0 013-3zM1 7.25h4v1.5H1v-1.5zm10 0h4v1.5h-4v-1.5z" />
  </svg>
);

function BuildRow({ build, now, onSelect }: { build: BuildSummary; now: number; onSelect: (id: number) => void }) {
  const duration = durationBetween(build.startTime, build.finishTime, now);

  return (
    <div
      class="row"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(build.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(build.id)}
    >
      <StatusIcon status={build.status} size="large" />
      <div>
        <div class="row-title" title={build.title}>
          #{build.buildNumber} • {build.title}
        </div>
        <div class="row-sub">
          <span class="meta">
            {build.pullRequestNumber ? <PullRequestIcon /> : <TriggerIcon />}
            {build.triggerLabel}
            {build.requestedFor && " for"}
          </span>
          {build.requestedFor && (
            <span class="meta requester" title={build.requestedFor}>
              <Avatar name={build.requestedFor} image={build.requestedForImage} />
              {build.requestedFor}
            </span>
          )}
          {build.pullRequestNumber ? (
            <span class="meta ref">
              <PullRequestIcon />
              {build.pullRequestNumber}
            </span>
          ) : (
            build.branch && (
              <span class="meta ref">
                <BranchIcon />
                {build.branch}
              </span>
            )
          )}
          {build.commit && (
            <span class="meta ref commit">
              <CommitIcon />
              {build.commit}
            </span>
          )}
        </div>
      </div>
      <StageDots stages={build.stages} />
      <div class="row-time">
        <div>{formatRelativeTime(build.startTime ?? build.queueTime, now)}</div>
        <div>{duration ?? (build.status === "queued" ? "Queued" : "")}</div>
      </div>
    </div>
  );
}

const STAGE_HEADER_HEIGHT = 16 + 22 + 20 + 4;
const JOB_ROW_HEIGHT = 26;
const STEP_ROW_HEIGHT = 22;

function stageHeight(stage: BuildStageDetail, expanded: Set<string>): number {
  const rows = stage.jobs.reduce(
    (sum, job) => sum + JOB_ROW_HEIGHT + (expanded.has(job.id) ? job.steps.length * STEP_ROW_HEIGHT : 0),
    0
  );
  return STAGE_HEADER_HEIGHT + rows;
}

function stageMeta(stage: BuildStageDetail, now: number): string {
  if (stage.state === "pending") {
    return "Not started";
  }
  const duration = durationBetween(stage.startTime, stage.finishTime, now);
  return `${stage.jobs.length} job${stage.jobs.length === 1 ? "" : "s"}${duration ? ` · ${duration}` : ""}`;
}

function StageBox({
  stage,
  layout,
  expanded,
  now,
  highlight,
  dependsOnNames,
  onHover,
  onToggleJob,
  onOpenLog,
}: {
  stage: BuildStageDetail;
  layout: PlacedNode;
  expanded: Set<string>;
  now: number;
  highlight?: "self" | "upstream" | "downstream";
  dependsOnNames: string[];
  onHover: (stageId: string | undefined) => void;
  onToggleJob: (jobId: string) => void;
  onOpenLog: (recordId: string) => void;
}) {
  return (
    <div
      class={`stage ${highlight ?? ""}`}
      style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height }}
      title={dependsOnNames.length > 0 ? `Depends on: ${dependsOnNames.join(", ")}` : "No dependency"}
      onMouseEnter={() => onHover(stage.id)}
      onMouseLeave={() => onHover(undefined)}
    >
      <div class="stage-title" title={stage.name}>
        <StatusIcon status={stage.state} />
        <span>{stage.name}</span>
      </div>
      <div class="stage-meta">{stageMeta(stage, now)}</div>
      {stage.jobs.map((job) => (
        <Fragment key={job.id}>
          <div class="job">
            <button
              class="chevron"
              disabled={job.steps.length === 0}
              aria-label={expanded.has(job.id) ? "Hide steps" : "Show steps"}
              onClick={() => onToggleJob(job.id)}
            >
              {job.steps.length === 0 ? "" : expanded.has(job.id) ? "▾" : "▸"}
            </button>
            <StatusIcon status={job.state} size="dot" />
            <button
              class="name"
              disabled={!job.hasLog}
              title={job.hasLog ? "Show job log" : job.name}
              onClick={() => onOpenLog(job.id)}
            >
              {job.name}
            </button>
            <span class="muted">{durationBetween(job.startTime, job.finishTime, now) ?? ""}</span>
          </div>
          {expanded.has(job.id) &&
            job.steps.map((step) => (
              <div class="step" key={step.id}>
                <StatusIcon status={step.state} size="dot" />
                <button
                  class="name"
                  disabled={!step.hasLog}
                  title={step.hasLog ? "Show step log" : step.name}
                  onClick={() => onOpenLog(step.id)}
                >
                  {step.name}
                </button>
                <span class="muted">{durationBetween(step.startTime, step.finishTime, now) ?? ""}</span>
              </div>
            ))}
        </Fragment>
      ))}
    </div>
  );
}

function edgePath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

function StageGraph({
  stages,
  dependenciesInferred,
  now,
  onOpenLog,
}: {
  stages: BuildStageDetail[];
  dependenciesInferred: boolean;
  now: number;
  onOpenLog: (recordId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | undefined>();
  const autoExpanded = useRef<Set<string>>(new Set());
  const toggleJob = (jobId: string): void =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(jobId)) {
        next.add(jobId);
      }
      return next;
    });

  // Running jobs open by themselves (once) so the step being executed is one click away
  useEffect(() => {
    const fresh = stages.flatMap((s) => s.jobs).filter((j) => j.state === "running" && !autoExpanded.current.has(j.id));
    if (fresh.length === 0) {
      return;
    }
    fresh.forEach((j) => autoExpanded.current.add(j.id));
    setExpanded((current) => new Set([...current, ...fresh.map((j) => j.id)]));
  }, [stages]);

  const layout = useMemo(
    () =>
      layoutStageGraph(
        stages.map((stage) => ({
          id: stage.id,
          height: stageHeight(stage, expanded),
          dependsOn: stage.dependsOn,
        }))
      ),
    [stages, expanded]
  );
  const stageById = new Map(stages.map((s) => [s.id, s]));

  // Highlight the declared (not only the drawn) links of the hovered stage: redundant links are hidden from the drawing
  const highlightOf = (id: string): "self" | "upstream" | "downstream" | undefined => {
    if (!hovered) {
      return undefined;
    }
    if (id === hovered) {
      return "self";
    }
    if (stageById.get(hovered)?.dependsOn.includes(id)) {
      return "upstream";
    }
    return stageById.get(id)?.dependsOn.includes(hovered) ? "downstream" : undefined;
  };

  return (
    <div class="graph-scroll">
      {dependenciesInferred && (
        <p class="graph-note">Pipeline YAML unavailable for this run: stage links are inferred from run timing.</p>
      )}
      <div class="graph" style={{ width: layout.width, height: layout.height }}>
        <svg width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
              <path class="arrow" d="M0 0 L8 4 L0 8 z" />
            </marker>
          </defs>
          {layout.edges.map((edge) => {
            const touchesHovered = edge.from === hovered || edge.to === hovered;
            const state = stageById.get(edge.from)?.state ?? "pending";
            const emphasis = hovered ? (touchesHovered ? "active" : "dim") : "";
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                class={`edge ${state} ${emphasis}`}
                d={edgePath(edge.points)}
                marker-end="url(#arrowhead)"
              />
            );
          })}
        </svg>
        {layout.nodes.map((node) => {
          const stage = stageById.get(node.id);
          return stage ? (
            <StageBox
              key={node.id}
              stage={stage}
              layout={node}
              expanded={expanded}
              now={now}
              highlight={highlightOf(node.id)}
              dependsOnNames={stage.dependsOn.map((id) => stageById.get(id)?.name ?? id)}
              onHover={setHovered}
              onToggleJob={toggleJob}
              onOpenLog={onOpenLog}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}

function DetailView({
  summary,
  detail,
  error,
  cancelNote,
  now,
  onBack,
}: {
  summary?: BuildSummary;
  detail?: BuildDetail;
  error?: string;
  cancelNote?: string;
  now: number;
  onBack: () => void;
}) {
  const build = detail ?? summary;
  if (!build) {
    return (
      <div>
        <button class="link" onClick={onBack}>
          ← Back to builds
        </button>
        <p class="muted">{error ?? "Loading build…"}</p>
      </div>
    );
  }

  const duration = durationBetween(build.startTime, build.finishTime, now);
  const warnings = detail?.issues.filter((i) => i.severity === "warning") ?? [];
  const errors = detail?.issues.filter((i) => i.severity === "error") ?? [];

  return (
    <div>
      <div class="toolbar">
        <button class="link" onClick={onBack}>
          ← Back to builds
        </button>
      </div>
      <div class="detail-head">
        <StatusIcon status={build.status} size="large" />
        <h1>
          #{build.buildNumber} • {build.title}
        </h1>
        <button onClick={() => postToHost({ type: "open-in-browser", buildId: build.id })}>Open in Azure DevOps</button>
        {isActive(build.status) && (
          <button
            class="danger"
            disabled={build.status === "cancelling"}
            onClick={() => postToHost({ type: "cancel-build", buildId: build.id })}
          >
            Cancel
          </button>
        )}
      </div>
      <div class="muted">{build.pipelineName}</div>
      {cancelNote && <div class="banner">{cancelNote}</div>}
      {error && <div class="banner error">{error}</div>}

      <div class="card">
        <h2 class="meta">
          {build.triggerLabel}
          {build.requestedFor && " by"}
          {build.requestedFor && <Avatar name={build.requestedFor} image={build.requestedForImage} />}
          {build.requestedFor}
        </h2>
        <div class="muted">
          {formatRelativeTime(build.startTime ?? build.queueTime, now)}
          {duration && ` · ${duration}`}
        </div>
        <div class="info-grid">
          <div>
            <div class="label">Repository and version</div>
            <div>{detail?.repositoryName}</div>
            <div>
              {build.pullRequestNumber ? `PR #${build.pullRequestNumber}` : build.branch}
              {build.commit && ` · ${build.commit}`}
            </div>
          </div>
        </div>
      </div>

      {detail && detail.issues.length > 0 && (
        <div class="card">
          <h2>
            {errors.length > 0 && `Errors (${errors.length})`}
            {errors.length > 0 && warnings.length > 0 && " · "}
            {warnings.length > 0 && `Warnings (${warnings.length})`}
          </h2>
          {detail.issues.map((issue, index) => (
            <div class="issue" key={index}>
              <StatusIcon status={issue.severity === "error" ? "failed" : "warning"} />
              <div>
                <div>{issue.message}</div>
                <div class="issue-source">{issue.source}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div class="card">
        <h2>Stages</h2>
        {!detail && <p class="muted">Loading stages…</p>}
        {detail && detail.stageDetails.length === 0 && <p class="muted">No stages reported yet.</p>}
        {detail && detail.stageDetails.length > 0 && (
          <StageGraph
            stages={detail.stageDetails}
            dependenciesInferred={detail.dependenciesInferred}
            now={now}
            onOpenLog={(recordId) => postToHost({ type: "open-log", buildId: build.id, recordId })}
          />
        )}
      </div>
    </div>
  );
}

function PipelineRow({ pipeline, now, onRun }: { pipeline: PipelineSummary; now: number; onRun: (id: number) => void }) {
  const last = pipeline.lastRun;
  return (
    <div class="row pipeline-row">
      {last ? <StatusIcon status={last.status} size="large" /> : <span class="icon pending large" aria-label="never run" />}
      <div>
        <div class="row-title" title={pipeline.name}>
          {pipeline.name}
        </div>
        <div class="row-sub">
          {pipeline.folder && <span class="meta">{pipeline.folder}</span>}
          {last ? (
            <>
              <span class="meta">#{last.buildNumber}</span>
              {last.branch && (
                <span class="meta ref">
                  <BranchIcon />
                  {last.branch}
                </span>
              )}
            </>
          ) : (
            <span class="meta">Never run</span>
          )}
        </div>
      </div>
      <div class="row-time">
        <div>{last ? formatRelativeTime(last.startTime, now) : ""}</div>
        <div>{last ? (durationBetween(last.startTime, last.finishTime, now) ?? "") : ""}</div>
      </div>
      <button class="primary" onClick={() => onRun(pipeline.id)}>
        Run pipeline
      </button>
    </div>
  );
}

function RunDialog({
  pipeline,
  options,
  running,
  error,
  onRun,
  onCancel,
}: {
  pipeline: PipelineSummary;
  options?: RunOptions;
  running: boolean;
  error?: string;
  onRun: (branch: string) => void;
  onCancel: () => void;
}) {
  const [branch, setBranch] = useState("");
  useEffect(() => {
    if (options) {
      setBranch(options.defaultBranch);
    }
  }, [options]);

  return (
    <div class="dialog-backdrop" onClick={onCancel}>
      <div class="dialog" role="dialog" aria-label="Run pipeline" onClick={(e) => e.stopPropagation()}>
        <h2>Run pipeline</h2>
        <div class="muted">{pipeline.name}</div>
        {!options ? (
          <p class="muted">Loading branches…</p>
        ) : (
          <label class="field">
            <span class="label">Branch</span>
            <input list="run-branches" value={branch} onInput={(e) => setBranch((e.target as HTMLInputElement).value)} />
            <datalist id="run-branches">
              {options.branches.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
        )}
        {error && <div class="banner error">{error}</div>}
        <div class="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button class="primary" disabled={!options || running || branch.trim() === ""} onClick={() => onRun(branch)}>
            {running ? "Starting…" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [viewState, setViewState] = useState<PipelinesViewState>("loading");
  const [message, setMessage] = useState<string | undefined>();
  const [projectLabel, setProjectLabel] = useState<string | undefined>();
  const [builds, setBuilds] = useState<BuildSummary[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [detail, setDetail] = useState<BuildDetail | undefined>();
  const [detailError, setDetailError] = useState<string | undefined>();
  const [cancelNote, setCancelNote] = useState<string | undefined>();
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<Tab>("builds");
  const [pipelines, setPipelines] = useState<PipelineSummary[] | undefined>();
  const [pipelinesError, setPipelinesError] = useState<string | undefined>();
  const [pipelineQuery, setPipelineQuery] = useState("");
  const [runTarget, setRunTarget] = useState<number | undefined>();
  const [runOptions, setRunOptions] = useState<RunOptions | undefined>();
  const [runError, setRunError] = useState<string | undefined>();
  const [runStarting, setRunStarting] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<HostToWebviewMessage>): void => {
      const msg = event.data;
      switch (msg.type) {
        case "view-state":
          setViewState(msg.state);
          setMessage(msg.message);
          if (msg.projectLabel) {
            setProjectLabel(msg.projectLabel);
          }
          if (msg.state === "no-connection") {
            setBuilds([]);
            setSelectedId(undefined);
            setDetail(undefined);
            setPipelines(undefined);
          }
          break;
        case "builds":
          setBuilds(msg.builds);
          setUpdatedAt(msg.updatedAt);
          setNow(Date.now());
          break;
        case "build-detail":
          setDetail(msg.detail);
          setDetailError(undefined);
          break;
        case "build-detail-error":
          setDetailError(msg.message);
          break;
        case "cancel-result":
          setCancelNote(msg.message);
          break;
        case "pipelines":
          setPipelines(msg.pipelines);
          setPipelinesError(undefined);
          break;
        case "pipelines-error":
          setPipelinesError(msg.message);
          break;
        case "run-options":
          setRunOptions(msg.options);
          break;
        case "run-result":
          setRunStarting(false);
          if (msg.success && msg.buildId !== undefined) {
            setRunTarget(undefined);
            setRunOptions(undefined);
            setTab("builds");
            setSelectedId(msg.buildId);
            setDetail(undefined);
            setDetailError(undefined);
            setCancelNote(undefined);
            postToHost({ type: "select-build", buildId: msg.buildId });
          } else {
            setRunError(msg.message ?? "The pipeline could not be started.");
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    postToHost({ type: "webview-ready" });
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const visibleBuilds = useMemo(
    () => (filter === "running" ? builds.filter((b) => isActive(b.status)) : builds),
    [builds, filter]
  );
  const runningCount = useMemo(() => builds.filter((b) => isActive(b.status)).length, [builds]);

  const selectBuild = (id: number): void => {
    setSelectedId(id);
    setDetail(undefined);
    setDetailError(undefined);
    setCancelNote(undefined);
    postToHost({ type: "select-build", buildId: id });
  };

  const deselectBuild = (): void => {
    setSelectedId(undefined);
    setDetail(undefined);
    postToHost({ type: "deselect-build" });
  };

  if (viewState === "no-connection") {
    return (
      <div class="empty">
        <h1>Azure DevOps Builds</h1>
        <p class="muted">No Azure DevOps project is active. Add a project in the Nexkit side panel (Project tab) first.</p>
      </div>
    );
  }

  if (viewState === "needs-auth") {
    return (
      <div class="empty">
        <h1>Azure DevOps Builds</h1>
        <p class="muted">{message ?? "Sign in with your Microsoft account to view builds."}</p>
        <button class="primary" onClick={() => postToHost({ type: "sign-in" })}>
          Sign in with Microsoft
        </button>
      </div>
    );
  }

  const selectedSummary = builds.find((b) => b.id === selectedId);
  if (selectedId !== undefined) {
    return (
      <DetailView
        summary={selectedSummary}
        detail={detail?.id === selectedId ? detail : undefined}
        error={detailError}
        cancelNote={cancelNote}
        now={now}
        onBack={deselectBuild}
      />
    );
  }

  const openPipelinesTab = (): void => {
    setTab("pipelines");
    postToHost({ type: "load-pipelines" });
  };

  const startRunDialog = (pipelineId: number): void => {
    setRunTarget(pipelineId);
    setRunOptions(undefined);
    setRunError(undefined);
    setRunStarting(false);
    postToHost({ type: "prepare-run", pipelineId });
  };

  const closeRunDialog = (): void => {
    setRunTarget(undefined);
    setRunOptions(undefined);
    setRunError(undefined);
    setRunStarting(false);
  };

  const submitRun = (branch: string): void => {
    if (runTarget === undefined) {
      return;
    }
    setRunError(undefined);
    setRunStarting(true);
    postToHost({ type: "run-pipeline", pipelineId: runTarget, branch });
  };

  const query = pipelineQuery.trim().toLowerCase();
  const visiblePipelines = (pipelines ?? []).filter(
    (p) => query === "" || p.name.toLowerCase().includes(query) || p.folder.toLowerCase().includes(query)
  );
  const runPipelineTarget = pipelines?.find((p) => p.id === runTarget);

  return (
    <div>
      <h1>Azure DevOps Builds</h1>
      <div class="muted">{projectLabel}</div>
      <div class="toolbar main-tabs">
        <div class="tabs">
          <button class={tab === "builds" ? "active" : ""} onClick={() => setTab("builds")}>
            Builds
          </button>
          <button class={tab === "pipelines" ? "active" : ""} onClick={openPipelinesTab}>
            Pipelines
          </button>
        </div>
      </div>

      {tab === "pipelines" ? (
        <>
          <div class="toolbar">
            <input
              class="search"
              type="search"
              placeholder="Filter pipelines"
              value={pipelineQuery}
              onInput={(e) => setPipelineQuery((e.target as HTMLInputElement).value)}
            />
            <span class="spacer" />
            <button onClick={() => postToHost({ type: "load-pipelines" })}>Refresh</button>
          </div>
          {pipelinesError && <div class="banner error">{pipelinesError}</div>}
          {!pipelines && !pipelinesError && <p class="muted">Loading pipelines…</p>}
          {pipelines && visiblePipelines.length === 0 && <p class="empty muted">No pipeline found.</p>}
          {visiblePipelines.length > 0 && (
            <div class="list">
              {visiblePipelines.map((pipeline) => (
                <PipelineRow key={pipeline.id} pipeline={pipeline} now={now} onRun={startRunDialog} />
              ))}
            </div>
          )}
          {runPipelineTarget && (
            <RunDialog
              pipeline={runPipelineTarget}
              options={runOptions?.pipelineId === runPipelineTarget.id ? runOptions : undefined}
              running={runStarting}
              error={runError}
              onRun={submitRun}
              onCancel={closeRunDialog}
            />
          )}
        </>
      ) : (
        <>
          <div class="toolbar">
            <div class="tabs">
              <button class={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
                All
              </button>
              <button class={filter === "running" ? "active" : ""} onClick={() => setFilter("running")}>
                In progress ({runningCount})
              </button>
            </div>
            <span class="spacer" />
            {updatedAt && <span class="muted">Updated {new Date(updatedAt).toLocaleTimeString()}</span>}
            <button onClick={() => postToHost({ type: "refresh" })}>Refresh</button>
          </div>

          {viewState === "error" && <div class="banner error">{message}</div>}
          {viewState === "loading" && builds.length === 0 && <p class="muted">Loading builds…</p>}
          {viewState !== "loading" && viewState !== "error" && visibleBuilds.length === 0 && (
            <p class="empty muted">{filter === "running" ? "No build is currently running." : "No builds found."}</p>
          )}

          {visibleBuilds.length > 0 && (
            <div class="list">
              {visibleBuilds.map((build) => (
                <BuildRow key={build.id} build={build} now={now} onSelect={selectBuild} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  render(<App />, root);
}
