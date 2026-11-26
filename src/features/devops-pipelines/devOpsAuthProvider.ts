import * as vscode from "vscode";

/**
 * Azure DevOps resource id; "/.default" requests a token usable against dev.azure.com
 */
const AZURE_DEVOPS_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";
const MICROSOFT_AUTH_PROVIDER_ID = "microsoft";

export interface IDevOpsAuthProvider {
  /**
   * Returns an Azure DevOps access token.
   * @param interactive When true, may prompt the user to sign in; otherwise only reuses an existing session.
   */
  getAccessToken(interactive: boolean): Promise<string | undefined>;
}

/**
 * Acquires Azure DevOps access tokens through the signed-in Microsoft account of VS Code.
 * Tokens are never persisted by the extension.
 */
export class DevOpsAuthProvider implements IDevOpsAuthProvider {
  public async getAccessToken(interactive: boolean): Promise<string | undefined> {
    const options: vscode.AuthenticationGetSessionOptions = interactive ? { createIfNone: true } : { silent: true };
    const session = await vscode.authentication.getSession(MICROSOFT_AUTH_PROVIDER_ID, [AZURE_DEVOPS_SCOPE], options);
    return session?.accessToken;
  }
}
