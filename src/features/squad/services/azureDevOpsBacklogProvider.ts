/**
 * Azure DevOps backlog provider (SQD-043, PRD FR-051).
 *
 * Reads Squad's `.squad/config.json` `ado` section (organization, project and
 * optional defaults) and verifies access through the user's existing Azure CLI
 * + Azure DevOps extension setup. Git remote inference is supported for
 * `dev.azure.com` / `*.visualstudio.com` remotes when no explicit platform is
 * configured, but configured `platform: "azure-devops"` requires valid `ado`
 * coordinates so failures are visible and actionable.
 */

import {
  SQUAD_BACKLOG_LABEL,
  SQUAD_UNTRIAGED_LABEL,
  SquadAzureDevOpsBacklogRef,
  SquadBacklogContext,
  SquadBacklogDetectionSource,
  SquadBacklogProvider,
  SquadBacklogProviderId,
  SquadBacklogProviderInfo,
  SquadError,
  SquadGitRemote,
  SquadResult,
  squadErr,
  squadOk,
} from "../models";
import { ChildProcessSquadRunner, SquadProcessRunner, SquadSpawnResult } from "./squadProcessRunner";

const DEFAULT_AZ_TIMEOUT_MS = 20000;
const MAX_DETAIL_LENGTH = 300;
const PREFERRED_REMOTES = ["origin", "upstream"];
const CLOSED_STATES = ["Closed", "Done", "Removed"] as const;
const AZ_INSTALL_REMEDIATION =
  "Install the Azure CLI and Azure DevOps extension (`az extension add --name azure-devops`), run `az login`, then refresh.";

/** Azure DevOps project parsed from a git remote URL. */
export interface ParsedAzureDevOpsRemote {
  /** Azure DevOps organization name. */
  organization: string;

  /** Canonical organization URL. */
  organizationUrl: string;

  /** Azure DevOps project name. */
  project: string;

  /** Remote name it was parsed from. */
  remoteName: string;
}

interface AzureDevOpsBacklogConfig extends SquadAzureDevOpsBacklogRef {
  /** Git remote name when coordinates were inferred from a remote. */
  remoteName: string | null;
}

/** Constructor options for {@link AzureDevOpsBacklogProvider}. */
export interface AzureDevOpsBacklogProviderOptions {
  /** Process runner used to invoke `az`; defaults to a `shell: false` child-process runner. */
  runner?: SquadProcessRunner;

  /** Azure CLI executable. Defaults to PATH resolution through the shared runner. */
  azCommand?: string;

  /** Timeout for each `az boards query` call in milliseconds. */
  timeoutMs?: number;
}

/** Azure DevOps implementation of {@link SquadBacklogProvider}. */
export class AzureDevOpsBacklogProvider implements SquadBacklogProvider {
  public readonly id = SquadBacklogProviderId.AzureDevOps;
  public readonly displayName = "Azure DevOps";

  private readonly _runner: SquadProcessRunner;
  private readonly _azCommand: string;
  private readonly _timeoutMs: number;

  constructor(options: AzureDevOpsBacklogProviderOptions = {}) {
    this._runner = options.runner ?? new ChildProcessSquadRunner();
    this._azCommand = options.azCommand ?? "az";
    this._timeoutMs = options.timeoutMs ?? DEFAULT_AZ_TIMEOUT_MS;
  }

  public matches(context: SquadBacklogContext): boolean {
    return selectAzureDevOpsRemote(context.remotes) !== null;
  }

  public async detect(context: SquadBacklogContext): Promise<SquadResult<SquadBacklogProviderInfo>> {
    const configResult = resolveAzureDevOpsConfig(context);
    if (!configResult.ok) {
      return configResult;
    }

    const config = configResult.value;
    const openResult = await this._queryCount(config, context);
    if (!openResult.ok) {
      return openResult;
    }

    const squadResult = await this._queryCount(config, context, SQUAD_BACKLOG_LABEL);
    if (!squadResult.ok) {
      return squadResult;
    }

    const untriagedResult = await this._queryCount(config, context, SQUAD_UNTRIAGED_LABEL);
    if (!untriagedResult.ok) {
      return untriagedResult;
    }

    return squadOk({
      providerId: SquadBacklogProviderId.AzureDevOps,
      displayName: `${config.organization}/${config.project}`,
      url: `${config.organizationUrl}/${encodeURIComponent(config.project)}`,
      remoteName: config.remoteName,
      readOnly: false,
      itemCounts: {
        open: openResult.value,
        squad: squadResult.value,
        untriaged: untriagedResult.value,
      },
      azureDevOps: toAzureDevOpsRef(config),
    });
  }

  private async _queryCount(
    config: AzureDevOpsBacklogConfig,
    context: SquadBacklogContext,
    tag?: string
  ): Promise<SquadResult<number>> {
    const result = await this._runner.run({
      command: this._azCommand,
      args: [
        "boards",
        "query",
        "--organization",
        config.organizationUrl,
        "--project",
        config.project,
        "--wiql",
        buildAzureDevOpsWiql(config, tag),
        "--output",
        "json",
      ],
      cwd: context.workspaceRoot.fsPath,
      timeoutMs: this._timeoutMs,
      token: context.token,
    });

    const failure = mapAzFailure(result, config);
    if (failure) {
      return squadErr(failure);
    }

    return parseQueryCount(result.stdout);
  }
}

/**
 * Parse Azure DevOps project coordinates from HTTPS and SSH git remotes:
 * - https://dev.azure.com/{org}/{project}/_git/{repo}
 * - https://{org}.visualstudio.com/{project}/_git/{repo}
 * - ssh://git@ssh.dev.azure.com/v3/{org}/{project}/{repo}
 * - git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
 */
export function parseAzureDevOpsRemote(remote: SquadGitRemote): ParsedAzureDevOpsRemote | null {
  const url = remote.url.trim();
  let host: string;
  let segments: string[];

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (!["https:", "http:", "ssh:", "git:", "git+ssh:", "ssh+git:"].includes(parsed.protocol)) {
      return null;
    }
    host = parsed.hostname.toLowerCase();
    segments = splitPathSegments(parsed.pathname);
  } else {
    const match = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(url);
    if (!match) {
      return null;
    }
    host = match[1].toLowerCase();
    segments = splitPathSegments(match[2]);
  }

  const coordinates = coordinatesFromHostAndSegments(host, segments);
  if (!coordinates) {
    return null;
  }

  return { ...coordinates, remoteName: remote.name };
}

/** Pick the Azure DevOps remote, preferring `origin` and `upstream`. */
export function selectAzureDevOpsRemote(remotes: readonly SquadGitRemote[]): ParsedAzureDevOpsRemote | null {
  const ordered = [...remotes].sort((a, b) => remoteRank(a.name) - remoteRank(b.name));
  for (const remote of ordered) {
    const parsed = parseAzureDevOpsRemote(remote);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

/** Build a flat WIQL query for open Squad backlog counts. */
export function buildAzureDevOpsWiql(config: SquadAzureDevOpsBacklogRef, tag?: string): string {
  const clauses = [
    "[System.TeamProject] = @project",
    ...CLOSED_STATES.map((state) => `[System.State] <> '${state}'`),
  ];

  if (config.areaPath) {
    clauses.push(`[System.AreaPath] UNDER '${escapeWiqlString(config.areaPath)}'`);
  }
  if (config.iterationPath) {
    clauses.push(`[System.IterationPath] UNDER '${escapeWiqlString(config.iterationPath)}'`);
  }
  if (tag) {
    clauses.push(`[System.Tags] CONTAINS '${escapeWiqlString(tag)}'`);
  }

  return `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(" AND ")} ORDER BY [System.ChangedDate] DESC`;
}

function resolveAzureDevOpsConfig(context: SquadBacklogContext): SquadResult<AzureDevOpsBacklogConfig> {
  const raw = context.config.raw;
  const ado = raw?.ado;
  if (ado !== undefined) {
    return parseAdoConfigObject(ado);
  }

  if (context.source === SquadBacklogDetectionSource.Config) {
    return squadErr({
      code: "parse-failed",
      message: "Azure DevOps is configured as the Squad backlog, but `.squad/config.json` is missing an `ado` object.",
      remediation:
        "Add `.squad/config.json` fields `platform: \"azure-devops\"` and `ado: { \"org\": \"<organization>\", \"project\": \"<project>\" }`, then refresh.",
    });
  }

  const remote = selectAzureDevOpsRemote(context.remotes);
  if (!remote) {
    return squadErr({
      code: "backlog-unavailable",
      message: "Azure DevOps backlog detection could not resolve an organization and project from git remotes.",
      remediation:
        "Configure `.squad/config.json` with `platform: \"azure-devops\"` and `ado.org` / `ado.project`, then refresh.",
    });
  }

  return squadOk({
    organization: remote.organization,
    organizationUrl: remote.organizationUrl,
    project: remote.project,
    remoteName: remote.remoteName,
  });
}

function parseAdoConfigObject(ado: unknown): SquadResult<AzureDevOpsBacklogConfig> {
  if (!ado || typeof ado !== "object" || Array.isArray(ado)) {
    return squadErr({
      code: "parse-failed",
      message: ".squad/config.json `ado` must be an object when Azure DevOps is used as the Squad backlog.",
      remediation: "Set `ado` to an object with string `org` and `project` properties, then refresh.",
    });
  }

  const record = ado as Readonly<Record<string, unknown>>;
  const orgResult = parseOrganization(record.org);
  if (!orgResult.ok) {
    return orgResult;
  }

  const project = parseRequiredString(record.project, "ado.project");
  if (!project.ok) {
    return project;
  }

  const defaultWorkItemType = parseOptionalString(record.defaultWorkItemType, "ado.defaultWorkItemType");
  if (!defaultWorkItemType.ok) {
    return defaultWorkItemType;
  }

  const areaPath = parseOptionalString(record.areaPath, "ado.areaPath");
  if (!areaPath.ok) {
    return areaPath;
  }

  const iterationPath = parseOptionalString(record.iterationPath, "ado.iterationPath");
  if (!iterationPath.ok) {
    return iterationPath;
  }

  return squadOk({
    organization: orgResult.value.organization,
    organizationUrl: orgResult.value.organizationUrl,
    project: project.value,
    remoteName: null,
    ...(defaultWorkItemType.value ? { defaultWorkItemType: defaultWorkItemType.value } : {}),
    ...(areaPath.value ? { areaPath: areaPath.value } : {}),
    ...(iterationPath.value ? { iterationPath: iterationPath.value } : {}),
  });
}

function parseOrganization(value: unknown): SquadResult<{ organization: string; organizationUrl: string }> {
  const org = parseRequiredString(value, "ado.org");
  if (!org.ok) {
    return org;
  }

  const parsedUrl = parseOrganizationUrl(org.value);
  if (parsedUrl) {
    return squadOk(parsedUrl);
  }

  if (!isSafeOrganization(org.value)) {
    return squadErr({
      code: "parse-failed",
      message: ".squad/config.json `ado.org` must be an Azure DevOps organization name or organization URL.",
      remediation: "Use an organization like `contoso` or `https://dev.azure.com/contoso`, then refresh.",
    });
  }

  return squadOk({ organization: org.value, organizationUrl: `https://dev.azure.com/${org.value}` });
}

function parseOrganizationUrl(value: string): { organization: string; organizationUrl: string } | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const segments = splitPathSegments(parsed.pathname);
  let organization: string | undefined;
  if (host === "dev.azure.com") {
    organization = segments[0];
  } else if (host.endsWith(".visualstudio.com")) {
    organization = host.slice(0, -".visualstudio.com".length);
  }

  if (!organization || !isSafeOrganization(organization)) {
    return null;
  }
  return { organization, organizationUrl: `https://dev.azure.com/${organization}` };
}

function parseRequiredString(value: unknown, fieldName: string): SquadResult<string> {
  if (typeof value !== "string" || !value.trim()) {
    return squadErr({
      code: "parse-failed",
      message: `.squad/config.json \`${fieldName}\` must be a non-empty string.`,
      remediation: `Set \`${fieldName}\` to a valid Azure DevOps value, then refresh.`,
    });
  }

  const trimmed = value.trim();
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return squadErr({
      code: "parse-failed",
      message: `.squad/config.json \`${fieldName}\` contains unsupported control characters.`,
      remediation: `Remove control characters from \`${fieldName}\`, then refresh.`,
    });
  }
  return squadOk(trimmed);
}

function parseOptionalString(value: unknown, fieldName: string): SquadResult<string | undefined> {
  if (value === undefined || value === null || value === "") {
    return squadOk(undefined);
  }
  return parseRequiredString(value, fieldName);
}

function coordinatesFromHostAndSegments(
  host: string,
  segments: readonly string[]
): { organization: string; organizationUrl: string; project: string } | null {
  if (host === "dev.azure.com" && segments.length >= 3 && segments[2].toLowerCase() === "_git") {
    const organization = segments[0];
    const project = segments[1];
    if (isSafeOrganization(organization) && isSafeProject(project)) {
      return { organization, organizationUrl: `https://dev.azure.com/${organization}`, project };
    }
  }

  if (host.endsWith(".visualstudio.com") && segments.length >= 2 && segments[1].toLowerCase() === "_git") {
    const organization = host.slice(0, -".visualstudio.com".length);
    const project = segments[0];
    if (isSafeOrganization(organization) && isSafeProject(project)) {
      return { organization, organizationUrl: `https://dev.azure.com/${organization}`, project };
    }
  }

  if ((host === "ssh.dev.azure.com" || host === "vs-ssh.visualstudio.com") && segments.length >= 4) {
    const [_v3, organization, project] = segments;
    if (segments[0].toLowerCase() === "v3" && isSafeOrganization(organization) && isSafeProject(project)) {
      return { organization, organizationUrl: `https://dev.azure.com/${organization}`, project };
    }
  }

  return null;
}

function mapAzFailure(result: SquadSpawnResult, config: AzureDevOpsBacklogConfig): SquadError | null {
  if (result.spawnErrorCode) {
    return {
      code: "backlog-tool-not-found",
      message: "The Azure CLI (az) is not installed or not on PATH, so the Azure DevOps backlog cannot be checked.",
      remediation: AZ_INSTALL_REMEDIATION,
      detail: result.spawnErrorCode === "ENOENT" ? undefined : result.spawnErrorCode,
    };
  }

  if (result.cancelled) {
    return { code: "cancelled", message: "Azure DevOps backlog detection was cancelled." };
  }

  if (result.timedOut) {
    return {
      code: "backlog-unavailable",
      message: `Checking the Azure DevOps backlog for ${config.organization}/${config.project} timed out.`,
      remediation: "Check your network connection and Azure DevOps status, then refresh.",
    };
  }

  if (result.exitCode === 0) {
    return null;
  }

  const output = `${result.stderr}\n${result.stdout}`;
  const detail = excerpt(result.stderr || result.stdout);

  if (/extension.*azure-devops|az extension add|not in the 'az' command group|misspelled or not recognized/i.test(output)) {
    return {
      code: "backlog-tool-not-found",
      message: "The Azure CLI Azure DevOps extension is not installed, so the backlog cannot be checked.",
      remediation: "Install it with `az extension add --name azure-devops`, run `az login`, then refresh.",
      detail,
    };
  }

  if (/az login|not logged in|unauthori[sz]ed|access denied|VS30063|TF400813|HTTP 401|401 \(Unauthorized\)/i.test(output)) {
    return {
      code: "backlog-auth-required",
      message: `The Azure CLI is not authenticated for ${config.organization}/${config.project}.`,
      remediation: "Run `az login`, verify Azure DevOps organization access, then refresh.",
      detail,
    };
  }

  if (/rate limit|throttl|HTTP 429|429 \(Too Many Requests\)/i.test(output)) {
    return {
      code: "backlog-rate-limited",
      message: "Azure DevOps rate-limited the backlog check.",
      remediation: "Wait a few minutes, then refresh the backlog status.",
      detail,
    };
  }

  if (/project.*not found|TF200016|VS403463|does not exist|not found/i.test(output)) {
    return {
      code: "backlog-unavailable",
      message: `The Azure DevOps project ${config.organization}/${config.project} was not found or is not accessible.`,
      remediation: "Verify `.squad/config.json` `ado.org` and `ado.project`, and confirm your account has project access.",
      detail,
    };
  }

  return {
    code: "backlog-unavailable",
    message: `The Azure CLI failed to read the Azure DevOps backlog for ${config.organization}/${config.project}.`,
    remediation: "Run `az boards query` in a terminal to diagnose, then refresh.",
    detail: detail ?? (result.exitCode === null ? undefined : `exit code ${result.exitCode}`),
  };
}

function parseQueryCount(stdout: string): SquadResult<number> {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    return squadErr({
      code: "parse-failed",
      message: "The Azure CLI returned an unexpected response while checking the backlog.",
      remediation: "Update the Azure CLI and Azure DevOps extension, then refresh.",
      detail: error instanceof Error ? error.message : undefined,
    });
  }

  const items = extractWorkItems(payload);
  if (!items) {
    return squadErr({
      code: "parse-failed",
      message: "The Azure CLI response did not include a work item list.",
      remediation: "Update the Azure CLI and Azure DevOps extension, then refresh.",
    });
  }

  return squadOk(items.length);
}

function extractWorkItems(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Readonly<Record<string, unknown>>;
  if (Array.isArray(record.workItems)) {
    return record.workItems;
  }
  if (Array.isArray(record.value)) {
    return record.value;
  }
  return null;
}

function toAzureDevOpsRef(config: AzureDevOpsBacklogConfig): SquadAzureDevOpsBacklogRef {
  return {
    organization: config.organization,
    organizationUrl: config.organizationUrl,
    project: config.project,
    ...(config.defaultWorkItemType ? { defaultWorkItemType: config.defaultWorkItemType } : {}),
    ...(config.areaPath ? { areaPath: config.areaPath } : {}),
    ...(config.iterationPath ? { iterationPath: config.iterationPath } : {}),
  };
}

function remoteRank(name: string): number {
  const index = PREFERRED_REMOTES.indexOf(name);
  return index === -1 ? PREFERRED_REMOTES.length : index;
}

function splitPathSegments(path: string): string[] {
  const rawSegments = path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  const segments: string[] = [];
  for (const segment of rawSegments) {
    try {
      segments.push(decodeURIComponent(segment));
    } catch {
      return [];
    }
  }
  return segments;
}

function isSafeOrganization(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(value);
}

function isSafeProject(value: string): boolean {
  return Boolean(value.trim()) && !/[\u0000-\u001f\u007f/\\]/.test(value);
}

function escapeWiqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function excerpt(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > MAX_DETAIL_LENGTH ? `${trimmed.slice(0, MAX_DETAIL_LENGTH)}…` : trimmed;
}
