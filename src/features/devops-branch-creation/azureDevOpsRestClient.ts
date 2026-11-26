import { getExtensionVersion } from "../../shared/utils/extensionHelper";
import { AzureDevOpsAuthService } from "./azureDevOpsAuthService";
import { AzureDevOpsWorkItem } from "./models/azureDevOpsWorkItem";

const API_VERSION = "7.1";

/**
 * Thin REST client for reading a single Azure DevOps work item by organization + ID.
 */
export class AzureDevOpsRestClient {
  constructor(private readonly _authService: AzureDevOpsAuthService) {}

  async getWorkItem(organization: string, workItemId: number): Promise<AzureDevOpsWorkItem> {
    const accessToken = await this._authService.getAccessToken();
    const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workitems/${workItemId}?api-version=${API_VERSION}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "User-Agent": `nexus-nexkit-vscode/${getExtensionVersion() ?? "unknown"}`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Impossible de contacter Azure DevOps : ${message}`);
    }

    if (!response.ok) {
      throw new Error(this._buildHttpErrorMessage(response, organization, workItemId));
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error("Réponse invalide reçue d'Azure DevOps (JSON illisible).");
    }

    const id = data?.id;
    const title = data?.fields?.["System.Title"];
    const type = data?.fields?.["System.WorkItemType"];

    if (typeof id !== "number" || typeof title !== "string" || typeof type !== "string") {
      throw new Error("Réponse Azure DevOps incomplète : champs manquants pour cet élément de travail.");
    }

    return { id, title, type, organization };
  }

  private _buildHttpErrorMessage(response: Response, organization: string, workItemId: number): string {
    if (response.status === 401 || response.status === 403) {
      return "Accès refusé à Azure DevOps. Vérifiez que l'organisation utilise l'authentification Microsoft Entra ID et que vous avez accès à cet élément de travail.";
    }
    if (response.status === 404) {
      return `Élément de travail #${workItemId} introuvable dans l'organisation "${organization}".`;
    }
    if (response.status === 429) {
      return "Limite de requêtes Azure DevOps atteinte. Veuillez réessayer dans quelques instants.";
    }
    return `Erreur Azure DevOps (${response.status} ${response.statusText}).`;
  }
}
