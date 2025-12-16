import * as vscode from "vscode";

export interface InitWizardResult {
  enableAzureDevOps: boolean;
  createVscodeSettings: boolean;
  createVscodeExtensions: boolean;
  enableAwesomeCopilot: boolean;
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

      // Step 3: VS Code extensions
      const createVscodeExtensions = await this.confirmVscodeExtensions();

      // Step 4: Awesome Copilot repository
      const enableAwesomeCopilot = await this.confirmAwesomeCopilot();

      return {
        enableAzureDevOps,
        createVscodeSettings,
        createVscodeExtensions,
        enableAwesomeCopilot,
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

  private async confirmVscodeExtensions(): Promise<boolean> {
    const result = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Would you like to add recommendation of VS Code extensions to your workspace?",
      title: "Nexkit Project Initialization - Step 3: VS Code Extensions",
    });

    return result === "Yes";
  }

  private async confirmAwesomeCopilot(): Promise<boolean> {
    const result = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Add Awesome Copilot repository as an additional source for prompts, instructions, and agents?",
      title: "Nexkit Project Initialization - Step 4: Awesome Copilot Repository",
    });

    return result === "Yes";
  }
}
