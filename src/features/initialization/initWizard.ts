import * as vscode from "vscode";

export interface InitWizardResult {
  enableAzureDevOpsMcpServer: boolean;
}

export class InitWizard {
  /**
   * Run the initialization wizard
   */
  async run(): Promise<InitWizardResult | null> {
    try {
      // Step 1: Azure DevOps MCP
      const enableAzureDevOpsMcpServer = await this.confirmAzureDevOpsMcpServer();

      return {
        enableAzureDevOpsMcpServer,
      };
    } catch (error) {
      vscode.window.showErrorMessage(`Wizard failed: ${error}`);
      return null;
    }
  }

  private async confirmAzureDevOpsMcpServer(): Promise<boolean> {
    const result = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Enable Azure DevOps MCP for project-specific Azure integration?",
      title: "Nexkit Project Initialization - Step 1: Azure DevOps MCP",
    });

    return result === "Yes";
  }
}
