/**
 * Pure type definitions for the Azure DevOps builds feature.
 * Contains zero runtime code so this module is safe to import from both
 * the extension host bundle and the webview bundle.
 */

export type BuildStatus = "queued" | "running" | "cancelling" | "succeeded" | "partiallySucceeded" | "failed" | "canceled";

export type StageState = "pending" | "running" | "succeeded" | "warning" | "failed" | "canceled" | "skipped";

export interface StageSummary {
  name: string;
  state: StageState;
}

export interface BuildSummary {
  id: number;
  buildNumber: string;
  title: string;
  pipelineName: string;
  status: BuildStatus;
  /** Human label of what triggered the run, e.g. "Individual CI", "PR automated", "Manual" */
  triggerLabel: string;
  requestedFor: string;
  /** Avatar of the requester as a data URI (undefined when unavailable) */
  requestedForImage?: string;
  /** Short branch name, e.g. "develop" */
  branch: string;
  /** Pull request number when the run was triggered by a PR */
  pullRequestNumber?: string;
  /** Abbreviated commit SHA */
  commit: string;
  /** ISO timestamps (queue/start/finish) */
  queueTime?: string;
  startTime?: string;
  finishTime?: string;
  /** Pipeline stages (undefined until the timeline is loaded) */
  stages?: StageSummary[];
}

export interface BuildStepDetail {
  id: string;
  name: string;
  state: StageState;
  startTime?: string;
  finishTime?: string;
  hasLog: boolean;
}

export interface BuildJobDetail extends BuildStepDetail {
  steps: BuildStepDetail[];
}

export interface BuildStageDetail extends StageSummary {
  id: string;
  startTime?: string;
  finishTime?: string;
  /** Ids of the stages this stage depends on */
  dependsOn: string[];
  /** True when dependsOn was guessed from run timing instead of the pipeline YAML */
  dependenciesInferred: boolean;
  jobs: BuildJobDetail[];
}

export interface BuildWarning {
  message: string;
  /** "Stage • Job • Task" breadcrumb */
  source: string;
  severity: "warning" | "error";
}

export interface BuildDetail extends BuildSummary {
  repositoryName: string;
  issues: BuildWarning[];
  stageDetails: BuildStageDetail[];
  /** True when some stage dependencies were inferred from run timing (YAML unavailable) */
  dependenciesInferred: boolean;
}

export type PipelinesViewState = "loading" | "no-connection" | "needs-auth" | "ready" | "error";

/**
 * Messages sent FROM the webview TO the extension host
 */
export type WebviewToHostMessage =
  | { type: "webview-ready" }
  | { type: "refresh" }
  | { type: "sign-in" }
  | { type: "select-build"; buildId: number }
  | { type: "deselect-build" }
  | { type: "cancel-build"; buildId: number }
  | { type: "open-log"; buildId: number; recordId: string }
  | { type: "open-in-browser"; buildId: number };

/**
 * Messages sent FROM the extension host TO the webview
 */
export type HostToWebviewMessage =
  | { type: "view-state"; state: PipelinesViewState; message?: string; projectLabel?: string }
  | { type: "builds"; builds: BuildSummary[]; updatedAt: number }
  | { type: "build-detail"; detail: BuildDetail }
  | { type: "build-detail-error"; buildId: number; message: string }
  | { type: "cancel-result"; buildId: number; success: boolean; message: string };
