import { IDevOpsAuthProvider } from "./devOpsAuthProvider";
import { parseStageDependencies } from "./stageDependencies";

const API_VERSION = "7.1";
const DEFAULT_TOP = 30;
const PIPELINES_PAGE_SIZE = 200;
const ACTIVE_BUILDS_PAGE_SIZE = 100;
/** Safety net against a continuation token that never ends */
const MAX_PAGES = 50;
const MAX_BRANCHES = 500;
const MAX_AVATAR_BYTES = 128 * 1024;

export type DevOpsApiErrorKind = "auth" | "forbidden" | "notFound" | "rateLimited" | "http" | "network";

export class DevOpsApiError extends Error {
  public constructor(
    public readonly kind: DevOpsApiErrorKind,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "DevOpsApiError";
  }
}

export interface DevOpsProjectRef {
  organization: string;
  project: string;
}

export interface RawIdentity {
  displayName?: string;
  uniqueName?: string;
  imageUrl?: string;
}

/** Author of a build change (commit); the avatar is exposed either as imageUrl or as an _links.avatar link */
export interface RawChangeAuthor extends RawIdentity {
  _links?: { avatar?: { href?: string } };
}

/** Subset of the Azure DevOps Build REST resource used by this feature */
export interface RawBuild {
  id: number;
  buildNumber: string;
  status?: string;
  result?: string;
  reason?: string;
  queueTime?: string;
  startTime?: string;
  finishTime?: string;
  sourceBranch?: string;
  sourceVersion?: string;
  sourceVersionMessage?: string;
  triggerInfo?: Record<string, string>;
  templateParameters?: Record<string, string>;
  definition?: { id: number; name: string };
  repository?: { id?: string; name?: string };
  requestedFor?: RawIdentity;
  requestedBy?: RawIdentity;
}

export interface RawTimelineIssue {
  type?: string;
  category?: string;
  message?: string;
}

export interface RawTimelineRecord {
  id: string;
  parentId?: string | null;
  type?: string;
  name?: string;
  /** YAML name of the stage/job (e.g. "Build_Infra") */
  identifier?: string | null;
  log?: { id: number } | null;
  state?: string;
  result?: string | null;
  order?: number;
  startTime?: string | null;
  finishTime?: string | null;
  issues?: RawTimelineIssue[];
}

export interface RawTimeline {
  records?: RawTimelineRecord[];
}

/** Subset of a build definition (pipeline) with its latest run, as returned by the definitions list */
export interface RawDefinition {
  id: number;
  name: string;
  path?: string;
  latestBuild?: RawBuild;
}

export interface PipelineSource {
  /** Repository type, e.g. "TfsGit" or "GitHub" */
  repositoryType?: string;
  repositoryId?: string;
  /** Full ref, e.g. refs/heads/main */
  defaultBranch?: string;
}

export function buildWebUrl(ref: DevOpsProjectRef, buildId: number): string {
  return `${projectBaseUrl(ref)}/_build/results?buildId=${buildId}`;
}

function projectBaseUrl(ref: DevOpsProjectRef): string {
  return `https://dev.azure.com/${encodeURIComponent(ref.organization)}/${encodeURIComponent(ref.project)}`;
}

/**
 * Thin client over the Azure DevOps Build REST API
 */
export class DevOpsBuildsClient {
  public constructor(
    private readonly _auth: IDevOpsAuthProvider,
    private readonly _userAgent: string,
    private readonly _fetch: typeof fetch = (input, init) => fetch(input, init)
  ) {}

  public async listBuilds(ref: DevOpsProjectRef, top: number = DEFAULT_TOP): Promise<RawBuild[]> {
    const url =
      `${projectBaseUrl(ref)}/_apis/build/builds?$top=${top}&queryOrder=queueTimeDescending` + `&api-version=${API_VERSION}`;
    const result = await this._request<{ value?: RawBuild[] }>(url);
    return result.value ?? [];
  }

  /** Number of builds currently running or waiting to start (all pages are counted) */
  public async countActiveBuilds(ref: DevOpsProjectRef): Promise<number> {
    const url =
      `${projectBaseUrl(ref)}/_apis/build/builds?statusFilter=inProgress,notStarted&$top=${ACTIVE_BUILDS_PAGE_SIZE}` +
      `&queryOrder=queueTimeDescending&api-version=${API_VERSION}`;
    const pages = await this._requestAllPages<unknown>(url);
    return pages.length;
  }

  public async getBuild(ref: DevOpsProjectRef, buildId: number): Promise<RawBuild> {
    const url = `${projectBaseUrl(ref)}/_apis/build/builds/${buildId}?api-version=${API_VERSION}`;
    return this._request<RawBuild>(url);
  }

  public async getTimeline(ref: DevOpsProjectRef, buildId: number): Promise<RawTimeline> {
    const url = `${projectBaseUrl(ref)}/_apis/build/builds/${buildId}/timeline?api-version=${API_VERSION}`;
    return this._request<RawTimeline>(url);
  }

  public async cancelBuild(ref: DevOpsProjectRef, buildId: number): Promise<void> {
    const url = `${projectBaseUrl(ref)}/_apis/build/builds/${buildId}?api-version=${API_VERSION}`;
    await this._request<unknown>(url, { method: "PATCH", body: JSON.stringify({ status: "cancelling" }) });
  }

  /** Lists all the pipelines (YAML and classic) of the project with their latest run */
  public async listPipelines(ref: DevOpsProjectRef, pageSize: number = PIPELINES_PAGE_SIZE): Promise<RawDefinition[]> {
    const url =
      `${projectBaseUrl(ref)}/_apis/build/definitions?includeLatestBuilds=true&queryOrder=definitionNameAscending` +
      `&$top=${pageSize}&api-version=${API_VERSION}`;
    return this._requestAllPages<RawDefinition>(url);
  }

  /** Queues a run of a pipeline on the given full ref (e.g. refs/heads/main) and returns the created build */
  public async runPipeline(ref: DevOpsProjectRef, definitionId: number, sourceBranch: string): Promise<RawBuild> {
    const url = `${projectBaseUrl(ref)}/_apis/build/builds?api-version=${API_VERSION}`;
    const body = { definition: { id: definitionId }, sourceBranch };
    return this._request<RawBuild>(url, { method: "POST", body: JSON.stringify(body) });
  }

  public async getPipelineSource(ref: DevOpsProjectRef, definitionId: number): Promise<PipelineSource> {
    const url = `${projectBaseUrl(ref)}/_apis/build/definitions/${definitionId}?api-version=${API_VERSION}`;
    const definition = await this._request<{ repository?: { id?: string; type?: string; defaultBranch?: string } }>(url);
    return {
      repositoryType: definition.repository?.type,
      repositoryId: definition.repository?.id,
      defaultBranch: definition.repository?.defaultBranch,
    };
  }

  /** Branch refs (refs/heads/...) of an Azure Repos Git repository */
  public async listBranches(ref: DevOpsProjectRef, repositoryId: string): Promise<string[]> {
    const url =
      `${projectBaseUrl(ref)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/refs` +
      `?filter=heads/&$top=${MAX_BRANCHES}&api-version=${API_VERSION}`;
    const result = await this._request<{ value?: Array<{ name?: string }> }>(url);
    return (result.value ?? []).map((r) => r.name).filter((n): n is string => !!n);
  }

  /**
   * Resolves the dependsOn graph of a YAML pipeline run by previewing the final (template-expanded) YAML.
   * The timeline does not expose dependencies. Returns undefined when it cannot be determined
   * (classic pipeline, missing permission, branch gone...).
   */
  public async getStageDependencies(ref: DevOpsProjectRef, build: RawBuild): Promise<Map<string, string[]> | undefined> {
    const definitionId = build.definition?.id;
    if (!definitionId || !build.sourceBranch) {
      return undefined;
    }

    const url = `${projectBaseUrl(ref)}/_apis/pipelines/${definitionId}/preview?api-version=${API_VERSION}`;
    const tryPreview = async (refName: string, version?: string): Promise<Map<string, string[]> | undefined> => {
      try {
        const body = {
          previewRun: true,
          resources: { repositories: { self: { refName, ...(version ? { version } : {}) } } },
          templateParameters: build.templateParameters,
        };
        const result = await this._request<{ finalYaml?: string }>(url, { method: "POST", body: JSON.stringify(body) });
        return result.finalYaml ? parseStageDependencies(result.finalYaml) : undefined;
      } catch (error) {
        if (error instanceof DevOpsApiError && error.kind === "auth") {
          throw error;
        }
        return undefined;
      }
    };

    const exact =
      (build.sourceVersion ? await tryPreview(build.sourceBranch, build.sourceVersion) : undefined) ??
      (await tryPreview(build.sourceBranch));
    if (exact) {
      return exact;
    }

    // Pull request merge refs and deleted branches cannot be previewed: use the source branch, then the default branch
    const prBranch = build.triggerInfo?.["pr.sourceBranch"];
    if (prBranch) {
      const fromPullRequest = await tryPreview(prBranch.startsWith("refs/") ? prBranch : `refs/heads/${prBranch}`);
      if (fromPullRequest) {
        return fromPullRequest;
      }
    }
    const defaultBranch = await this._getDefaultBranch(ref, definitionId);
    return defaultBranch && defaultBranch !== build.sourceBranch ? tryPreview(defaultBranch) : undefined;
  }

  private async _getDefaultBranch(ref: DevOpsProjectRef, definitionId: number): Promise<string | undefined> {
    try {
      const url = `${projectBaseUrl(ref)}/_apis/build/definitions/${definitionId}?api-version=${API_VERSION}`;
      const definition = await this._request<{ repository?: { defaultBranch?: string } }>(url);
      return definition.repository?.defaultBranch;
    } catch (error) {
      if (error instanceof DevOpsApiError && error.kind === "auth") {
        throw error;
      }
      return undefined;
    }
  }

  /**
   * Author of the first change of a build. Used when the requester is a service identity
   * (GitHub app, "Microsoft.VisualStudio.Services.TFS"...), which hides the real person.
   */
  public async getBuildAuthor(ref: DevOpsProjectRef, buildId: number): Promise<RawChangeAuthor | undefined> {
    try {
      const url = `${projectBaseUrl(ref)}/_apis/build/builds/${buildId}/changes?$top=1&api-version=${API_VERSION}`;
      const result = await this._request<{ value?: Array<{ author?: RawChangeAuthor }> }>(url);
      return result.value?.[0]?.author;
    } catch (error) {
      if (error instanceof DevOpsApiError && error.kind === "auth") {
        throw error;
      }
      return undefined;
    }
  }

  /**
   * Downloads a small avatar and returns it as a data URI (the webview cannot authenticate image requests).
   * Only known avatar hosts are contacted; the Azure DevOps token is sent to Azure DevOps hosts only.
   */
  public async getAvatarDataUri(url: string): Promise<string | undefined> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return undefined;
    }
    const isAzureDevOps = target.hostname === "dev.azure.com" || target.hostname.endsWith(".visualstudio.com");
    const isGitHub = target.hostname.endsWith(".githubusercontent.com");
    if (target.protocol !== "https:" || !(isAzureDevOps || isGitHub)) {
      return undefined;
    }

    try {
      const headers: Record<string, string> = { "User-Agent": this._userAgent };
      if (isAzureDevOps) {
        const token = await this._auth.getAccessToken(false);
        if (!token) {
          return undefined;
        }
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await this._fetch(target.toString(), { headers });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.startsWith("image/")) {
        return undefined;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return bytes.length > 0 && bytes.length <= MAX_AVATAR_BYTES
        ? `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`
        : undefined;
    } catch {
      return undefined;
    }
  }

  /** Returns log lines of one timeline record, starting at the 1-based startLine */
  public async getLogLines(ref: DevOpsProjectRef, buildId: number, logId: number, startLine: number): Promise<string[]> {
    const url =
      `${projectBaseUrl(ref)}/_apis/build/builds/${buildId}/logs/${logId}` + `?startLine=${startLine}&api-version=${API_VERSION}`;
    const result = await this._request<{ value?: string[] }>(url);
    return result.value ?? [];
  }

  /** Follows the x-ms-continuationtoken header and returns the items of every page */
  private async _requestAllPages<T>(url: string): Promise<T[]> {
    const items: T[] = [];
    let continuationToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const pageUrl = continuationToken ? `${url}&continuationToken=${encodeURIComponent(continuationToken)}` : url;
      const { data, continuationToken: next } = await this._requestWithHeaders<{ value?: T[] }>(pageUrl);
      items.push(...(data.value ?? []));
      if (!next) {
        return items;
      }
      continuationToken = next;
    }
    throw new Error(`Azure DevOps returned more than ${MAX_PAGES} pages; the result would be incomplete.`);
  }

  private async _request<T>(url: string, init: { method?: string; body?: string } = {}): Promise<T> {
    return (await this._requestWithHeaders<T>(url, init)).data;
  }

  private async _requestWithHeaders<T>(
    url: string,
    init: { method?: string; body?: string } = {}
  ): Promise<{ data: T; continuationToken?: string }> {
    const token = await this._auth.getAccessToken(false);
    if (!token) {
      throw new DevOpsApiError("auth", "Not signed in to Azure DevOps.");
    }

    let response: Response;
    try {
      response = await this._fetch(url, {
        method: init.method ?? "GET",
        body: init.body,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": this._userAgent,
        },
      });
    } catch (error) {
      throw new DevOpsApiError("network", error instanceof Error ? error.message : "Network error.");
    }

    if (!response.ok) {
      throw this._toApiError(response);
    }

    // Azure DevOps answers 203 + an HTML sign-in page when the token is rejected
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      throw new DevOpsApiError("auth", "Azure DevOps did not accept the credentials.", response.status);
    }

    return {
      data: (await response.json()) as T,
      continuationToken: response.headers.get("x-ms-continuationtoken") || undefined,
    };
  }

  private _toApiError(response: Response): DevOpsApiError {
    switch (response.status) {
      case 401:
        return new DevOpsApiError("auth", "Azure DevOps rejected the credentials (401).", 401);
      case 403:
        return new DevOpsApiError("forbidden", "You do not have permission to view builds in this project (403).", 403);
      case 404:
        return new DevOpsApiError("notFound", "Organization, project or build not found (404).", 404);
      case 429:
        return new DevOpsApiError("rateLimited", "Azure DevOps rate limit reached (429). Try again shortly.", 429);
      default:
        return new DevOpsApiError("http", `Azure DevOps request failed (${response.status}).`, response.status);
    }
  }
}
