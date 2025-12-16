import * as vscode from "vscode";

export interface InitWizardResult {
  enableAzureDevOps: boolean;
  createVscodeSettings: boolean;
}

export class InitWizard {
  /**
   * Run the initialization wizard
   */
  async run(): Promise<InitWizardResult | null> {
    try {
      // Step 1: Azure DevOps MCP
      const enableAzureDevOps = await this.confirmAzureDevOps();

      // Step 2: VS Code settings
      const createVscodeSettings = await this.confirmVscodeSettings();

      return {
        enableAzureDevOps,
        createVscodeSettings,
      };
    } catch (error) {
      vscode.window.showErrorMessage(`Wizard failed: ${error}`);
      return null;
    }
  }

  private async confirmAzureDevOps(): Promise<boolean> {
    const result = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Enable Azure DevOps MCP for project-specific Azure integration?",
      title: "Nexkit Project Initialization - Step 1: Azure DevOps MCP",
    });

    return result === "Yes";
  }

  private async confirmVscodeSettings(): Promise<boolean> {
    const result = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Create .vscode/settings.json with recommended settings?",
      title: "Nexkit Project Initialization - Step 2: VS Code Settings",
    });

    return result === "Yes";
  }
}
