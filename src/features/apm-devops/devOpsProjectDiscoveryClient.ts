import { DevOpsApiError } from "../devops-pipelines/devOpsBuildsClient";
import { IDevOpsAuthProvider } from "../devops-pipelines/devOpsAuthProvider";

const API_VERSION = "7.1";
const PROFILE_URL = "https://app.vssps.visualstudio.com/_apis/profile/profiles/me";
const ACCOUNTS_URL = "https://app.vssps.visualstudio.com/_apis/accounts";
const MAX_PROJECTS = 500;

export interface IDevOpsProjectDiscovery {
  listOrganizations(): Promise<string[]>;
  listProjects(organization: string): Promise<string[]>;
}

/**
 * Lists the Azure DevOps organizations and projects the signed-in Microsoft account can access
 */
export class DevOpsProjectDiscoveryClient implements IDevOpsProjectDiscovery {
  public constructor(
    private readonly _auth: IDevOpsAuthProvider,
    private readonly _userAgent: string,
    private readonly _fetch: typeof fetch = fetch
  ) {}

  public async listOrganizations(): Promise<string[]> {
    const profile = await this._get<{ id?: string }>(`${PROFILE_URL}?api-version=${API_VERSION}`);
    if (!profile.id) {
      throw new DevOpsApiError("http", "Could not determine the signed-in Azure DevOps profile.");
    }
    const accounts = await this._get<{ value?: { accountName?: string }[] }>(
      `${ACCOUNTS_URL}?memberId=${encodeURIComponent(profile.id)}&api-version=${API_VERSION}`
    );
    return (accounts.value ?? [])
      .map((account) => account.accountName)
      .filter((name): name is string => !!name)
      .sort((a, b) => a.localeCompare(b));
  }

  public async listProjects(organization: string): Promise<string[]> {
    const result = await this._get<{ value?: { name?: string }[] }>(
      `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects?$top=${MAX_PROJECTS}&api-version=${API_VERSION}`
    );
    return (result.value ?? [])
      .map((project) => project.name)
      .filter((name): name is string => !!name)
      .sort((a, b) => a.localeCompare(b));
  }

  private async _get<T>(url: string): Promise<T> {
    // Browsing is user initiated, so signing in interactively is acceptable here
    const token = await this._auth.getAccessToken(true);
    if (!token) {
      throw new DevOpsApiError("auth", "Not signed in to Azure DevOps.");
    }

    let response: Response;
    try {
      response = await this._fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": this._userAgent },
      });
    } catch (error) {
      throw new DevOpsApiError("network", error instanceof Error ? error.message : "Network error.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new DevOpsApiError("auth", "Access to Azure DevOps was denied for this account.", response.status);
    }
    if (!response.ok) {
      throw new DevOpsApiError("http", `Azure DevOps returned HTTP ${response.status}.`, response.status);
    }
    return (await response.json()) as T;
  }
}
