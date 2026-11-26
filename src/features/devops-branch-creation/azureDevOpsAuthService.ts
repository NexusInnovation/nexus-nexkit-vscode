import * as vscode from "vscode";

/** Azure DevOps resource ID scope for Microsoft Entra ID authentication. */
const AZURE_DEVOPS_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";

/**
 * Acquires Microsoft Entra ID access tokens scoped to Azure DevOps.
 */
export class AzureDevOpsAuthService {
  async getAccessToken(): Promise<string> {
    const session = await vscode.authentication.getSession("microsoft", [AZURE_DEVOPS_SCOPE], { createIfNone: true });

    if (!session) {
      throw new Error("Authentification Microsoft annulée. Impossible de continuer sans session authentifiée.");
    }

    return session.accessToken;
  }
}
