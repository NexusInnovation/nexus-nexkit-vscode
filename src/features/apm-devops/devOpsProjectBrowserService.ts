import * as vscode from "vscode";
import { IDevOpsProjectDiscovery } from "./devOpsProjectDiscoveryClient";

/**
 * Lets the user pick an existing Azure DevOps project (organization, then project) from Quick Pick lists
 */
export class DevOpsProjectBrowserService {
  public constructor(private readonly _discovery: IDevOpsProjectDiscovery) {}

  /**
   * @returns The project URL, or undefined when the user cancelled
   * @throws When organizations or projects cannot be listed
   */
  public async browse(): Promise<string | undefined> {
    const organization = await vscode.window.showQuickPick(this._discovery.listOrganizations(), {
      title: "Add Azure DevOps Project (1/2)",
      placeHolder: "Select an organization",
    });
    if (!organization) {
      return undefined;
    }

    const project = await vscode.window.showQuickPick(this._discovery.listProjects(organization), {
      title: `Add Azure DevOps Project (2/2) — ${organization}`,
      placeHolder: "Select a project",
    });
    if (!project) {
      return undefined;
    }

    return buildProjectUrl(organization, project);
  }
}

export function buildProjectUrl(organization: string, project: string): string {
  return `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`;
}
