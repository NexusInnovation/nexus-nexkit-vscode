import {
  BuildDetail,
  BuildStageDetail,
  BuildStatus,
  BuildSummary,
  BuildWarning,
  PipelineSummary,
  StageState,
  StageSummary,
} from "./messages";
import { RawBuild, RawChangeAuthor, RawDefinition, RawIdentity, RawTimeline, RawTimelineRecord } from "./devOpsBuildsClient";

const COMMIT_LENGTH = 8;
const DEFAULT_STAGE_NAME = "__default";

const TRIGGER_LABELS: Record<string, string> = {
  individualCI: "Individual CI",
  batchedCI: "Batched CI",
  pullRequest: "PR automated",
  manual: "Manual",
  schedule: "Scheduled",
  buildCompletion: "Build completion",
  resourceTrigger: "Resource trigger",
  checkInShelveset: "Gated check-in",
};

/** Builds that are still moving (polling is only needed while one of these exists) */
export function isActiveStatus(status: BuildStatus): boolean {
  return status === "queued" || status === "running" || status === "cancelling";
}

export function mapBuildStatus(raw: Pick<RawBuild, "status" | "result">): BuildStatus {
  switch (raw.status) {
    case "inProgress":
      return "running";
    case "cancelling":
      return "cancelling";
    case "completed":
      switch (raw.result) {
        case "succeeded":
          return "succeeded";
        case "partiallySucceeded":
          return "partiallySucceeded";
        case "canceled":
          return "canceled";
        default:
          return "failed";
      }
    default:
      return "queued";
  }
}

function shortBranch(ref: string | undefined): string {
  if (!ref) {
    return "";
  }
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
}

function firstLine(text: string | undefined): string | undefined {
  const line = text?.split(/\r?\n/)[0]?.trim();
  return line ? line : undefined;
}

export interface Requester {
  name: string;
  /** Avatar URL (not yet downloaded) */
  imageUrl?: string;
}

/** Requester ready to display: its avatar is already downloaded as a data URI */
export interface ResolvedRequester {
  name: string;
  image?: string;
}

const GUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SERVICE_UNIQUE_NAME = new RegExp(`^${GUID}@${GUID}$|\\\\${GUID}$`, "i");

/** True for bots/service accounts (GitHub app, "Microsoft.VisualStudio.Services.TFS"...) that hide the real requester */
export function isServiceIdentity(identity: RawIdentity | undefined): boolean {
  const name = identity?.displayName;
  return (
    !name ||
    name === "GitHub" ||
    name.startsWith("Microsoft.VisualStudio.Services") ||
    SERVICE_UNIQUE_NAME.test(identity?.uniqueName ?? "")
  );
}

/** True when the real person can only be found in the commit author (the build API names a service) */
export function requesterNeedsAuthor(raw: RawBuild): boolean {
  return isServiceIdentity(raw.requestedFor) && isServiceIdentity(raw.requestedBy);
}

/**
 * Picks the most human requester: the identity on the build, else the author of the change,
 * else the pull request sender, else whatever name the build carries.
 */
export function resolveRequester(raw: RawBuild, author?: RawChangeAuthor): Requester {
  const person = [raw.requestedFor, raw.requestedBy].find((identity) => !isServiceIdentity(identity));
  if (person) {
    return { name: person.displayName as string, imageUrl: person.imageUrl };
  }
  if (author?.displayName && !isServiceIdentity(author)) {
    return { name: author.displayName, imageUrl: author.imageUrl ?? author._links?.avatar?.href };
  }
  const sender = raw.triggerInfo?.["pr.sender.name"];
  if (sender) {
    return { name: sender, imageUrl: raw.triggerInfo?.["pr.sender.avatarUrl"] };
  }
  return { name: raw.requestedFor?.displayName ?? raw.requestedBy?.displayName ?? "" };
}

export function toPipelineSummary(raw: RawDefinition): PipelineSummary {
  const last = raw.latestBuild;
  return {
    id: raw.id,
    name: raw.name,
    folder: raw.path && raw.path !== "\\" ? raw.path : "",
    lastRun: last
      ? {
          buildId: last.id,
          buildNumber: last.buildNumber,
          status: mapBuildStatus(last),
          branch: shortBranch(last.sourceBranch),
          startTime: last.startTime,
          finishTime: last.finishTime,
        }
      : undefined,
  };
}

export function shortBranchName(ref: string | undefined): string {
  return shortBranch(ref);
}

export function toBuildSummary(raw: RawBuild, stages?: StageSummary[], requester?: ResolvedRequester): BuildSummary {
  const trigger = raw.triggerInfo ?? {};
  const isPullRequest = raw.reason === "pullRequest";
  const pullRequestNumber = isPullRequest
    ? (trigger["pr.number"] ?? /^refs\/pull\/(\d+)\//.exec(raw.sourceBranch ?? "")?.[1])
    : undefined;

  const branchRef = isPullRequest ? (trigger["pr.sourceBranch"] ?? raw.sourceBranch) : raw.sourceBranch;
  const resolved = requester ?? resolveRequester(raw);

  return {
    id: raw.id,
    buildNumber: raw.buildNumber,
    title:
      firstLine(trigger["pr.title"]) ??
      firstLine(trigger["ci.message"]) ??
      firstLine(raw.sourceVersionMessage) ??
      raw.definition?.name ??
      raw.buildNumber,
    pipelineName: raw.definition?.name ?? "",
    status: mapBuildStatus(raw),
    triggerLabel: TRIGGER_LABELS[raw.reason ?? ""] ?? "Build",
    requestedFor: resolved.name,
    requestedForImage: requester?.image,
    branch: shortBranch(branchRef),
    pullRequestNumber,
    commit: (raw.sourceVersion ?? "").slice(0, COMMIT_LENGTH),
    queueTime: raw.queueTime,
    startTime: raw.startTime,
    finishTime: raw.finishTime,
    stages,
  };
}

export function mapRecordState(record: Pick<RawTimelineRecord, "state" | "result">): StageState {
  if (record.state === "pending") {
    return "pending";
  }
  if (record.state === "inProgress") {
    return "running";
  }
  switch (record.result) {
    case "failed":
      return "failed";
    case "succeededWithIssues":
      return "warning";
    case "canceled":
    case "abandoned":
      return "canceled";
    case "skipped":
      return "skipped";
    default:
      return "succeeded";
  }
}

function displayName(record: RawTimelineRecord): string {
  return !record.name || record.name === DEFAULT_STAGE_NAME ? "Build" : record.name;
}

function byOrder(a: RawTimelineRecord, b: RawTimelineRecord): number {
  return (a.order ?? 0) - (b.order ?? 0);
}

function stageRecords(timeline: RawTimeline): RawTimelineRecord[] {
  return (timeline.records ?? []).filter((r) => r.type === "Stage").sort(byOrder);
}

export function toStageSummaries(timeline: RawTimeline): StageSummary[] {
  return stageRecords(timeline).map((stage) => ({ name: displayName(stage), state: mapRecordState(stage) }));
}

/** Finds the enclosing stage of a record by walking up its parents */
function findStageId(record: RawTimelineRecord, byId: Map<string, RawTimelineRecord>): string | undefined {
  let current: RawTimelineRecord | undefined = record;
  for (let depth = 0; current && depth < 10; depth++) {
    if (current.type === "Stage") {
      return current.id;
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}

const INFERENCE_TOLERANCE_MS = 2000;

function time(value: string | null | undefined): number | undefined {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Guesses stage predecessors from run timing when the YAML dependencies are unavailable:
 * a stage follows the stages that finished last before it started. Stages that have not started
 * yet follow the stages currently running (or else the latest finished ones).
 */
function inferPredecessors(stage: RawTimelineRecord, stages: RawTimelineRecord[]): string[] {
  const others = stages.filter((s) => s.id !== stage.id);
  const started = time(stage.startTime);

  let candidates: { id: string; finish: number }[];
  if (started !== undefined) {
    candidates = others
      .filter((s) => (time(s.startTime) ?? Infinity) < started)
      .map((s) => ({ id: s.id, finish: time(s.finishTime) }))
      .filter((c): c is { id: string; finish: number } => c.finish !== undefined && c.finish <= started);
  } else {
    const running = others.filter((s) => s.state === "inProgress");
    candidates =
      running.length > 0
        ? running.map((s) => ({ id: s.id, finish: Number.MAX_SAFE_INTEGER }))
        : others
            .map((s) => ({ id: s.id, finish: time(s.finishTime) }))
            .filter((c): c is { id: string; finish: number } => c.finish !== undefined);
  }

  if (candidates.length === 0) {
    return [];
  }
  const latest = Math.max(...candidates.map((c) => c.finish));
  return candidates.filter((c) => c.finish >= latest - INFERENCE_TOLERANCE_MS).map((c) => c.id);
}

export function toStageDetails(timeline: RawTimeline, dependencies?: Map<string, string[]>): BuildStageDetail[] {
  const records = timeline.records ?? [];
  const byId = new Map(records.map((r) => [r.id, r]));
  const jobs = records.filter((r) => r.type === "Job").sort(byOrder);
  const tasks = records.filter((r) => r.type === "Task").sort(byOrder);
  const stages = stageRecords(timeline);
  const idByIdentifier = new Map(stages.filter((s) => s.identifier).map((s) => [s.identifier as string, s.id]));

  return stages.map((stage) => {
    const declared = stage.identifier ? dependencies?.get(stage.identifier) : undefined;
    const dependsOn = declared
      ? declared.map((name) => idByIdentifier.get(name)).filter((id): id is string => id !== undefined && id !== stage.id)
      : stages.length > 1
        ? inferPredecessors(stage, stages)
        : [];

    return {
      id: stage.id,
      name: displayName(stage),
      state: mapRecordState(stage),
      startTime: stage.startTime ?? undefined,
      finishTime: stage.finishTime ?? undefined,
      dependsOn,
      dependenciesInferred: !declared && stages.length > 1,
      jobs: jobs
        .filter((job) => findStageId(job, byId) === stage.id)
        .map((job) => ({
          id: job.id,
          name: displayName(job),
          state: mapRecordState(job),
          startTime: job.startTime ?? undefined,
          finishTime: job.finishTime ?? undefined,
          hasLog: Boolean(job.log),
          steps: tasks
            .filter((task) => task.parentId === job.id)
            .map((task) => ({
              id: task.id,
              name: task.name ?? "",
              state: mapRecordState(task),
              startTime: task.startTime ?? undefined,
              finishTime: task.finishTime ?? undefined,
              hasLog: Boolean(task.log),
            })),
        })),
    };
  });
}

/** Collects warnings and errors with a "Stage • Job • Task" breadcrumb; errors come first */
export function toIssues(timeline: RawTimeline): BuildWarning[] {
  const records = timeline.records ?? [];
  const byId = new Map(records.map((r) => [r.id, r]));
  const issues: BuildWarning[] = [];

  for (const record of records) {
    for (const issue of record.issues ?? []) {
      if ((issue.type !== "warning" && issue.type !== "error") || !issue.message) {
        continue;
      }
      issues.push({ message: issue.message, severity: issue.type, source: breadcrumb(record, byId) });
    }
  }

  return issues.sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error"));
}

function breadcrumb(record: RawTimelineRecord, byId: Map<string, RawTimelineRecord>): string {
  const parts: string[] = [];
  let current: RawTimelineRecord | undefined = record;
  for (let depth = 0; current && depth < 10; depth++) {
    if (current.type !== "Phase" && current.type !== "Checkpoint") {
      parts.unshift(displayName(current));
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(" • ");
}

export function toBuildDetail(
  raw: RawBuild,
  timeline: RawTimeline,
  dependencies?: Map<string, string[]>,
  requester?: ResolvedRequester
): BuildDetail {
  const stageDetails = toStageDetails(timeline, dependencies);
  return {
    ...toBuildSummary(
      raw,
      stageDetails.map(({ name, state }) => ({ name, state })),
      requester
    ),
    repositoryName: raw.repository?.name ?? "",
    issues: toIssues(timeline),
    stageDetails,
    dependenciesInferred: stageDetails.some((s) => s.dependenciesInferred),
  };
}

/** State and log location of any timeline record, even before its log exists */
export function describeRecord(
  timeline: RawTimeline,
  recordId: string
): { name: string; type?: string; logId?: number; finished: boolean } | undefined {
  const record = (timeline.records ?? []).find((r) => r.id === recordId);
  if (!record) {
    return undefined;
  }
  return { name: displayName(record), type: record.type, logId: record.log?.id, finished: record.state === "completed" };
}

/**
 * Picks the step to show once `currentId` is done: the next unfinished step of the same job,
 * otherwise the earliest-started step running elsewhere.
 */
export function findNextStep(timeline: RawTimeline, currentId: string): { id: string; name: string } | undefined {
  const tasks = (timeline.records ?? []).filter((r) => r.type === "Task");
  const current = tasks.find((t) => t.id === currentId);
  if (!current) {
    return undefined;
  }

  const nextInJob = tasks
    .filter((t) => t.parentId === current.parentId && (t.order ?? 0) > (current.order ?? 0) && t.state !== "completed")
    .sort(byOrder)[0];
  const next =
    nextInJob ??
    tasks
      .filter((t) => t.id !== currentId && t.state === "inProgress")
      .sort((a, b) => (Date.parse(a.startTime ?? "") || 0) - (Date.parse(b.startTime ?? "") || 0))[0];

  return next ? { id: next.id, name: displayName(next) } : undefined;
}

/** True while any stage, job or step of the run has not completed */
export function isTimelineActive(timeline: RawTimeline): boolean {
  return (timeline.records ?? []).some(
    (r) => (r.type === "Stage" || r.type === "Job" || r.type === "Task") && r.state !== "completed"
  );
}
