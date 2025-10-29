import * as vscode from 'vscode';

export interface InitWizardResult {
  languages: string[];
  enableAzureDevOps: boolean;
  createVscodeSettings: boolean;
  createGitignore: boolean;
}

export class InitWizard {
  /**
   * Run the initialization wizard
   */
  async run(): Promise<InitWizardResult | null> {
    try {
      // Step 1: Select languages/frameworks
      const languages = await this.selectLanguages();
      if (!languages || languages.length === 0) {
        return null; // User cancelled
      }

      // Step 2: Azure DevOps MCP
      const enableAzureDevOps = await this.confirmAzureDevOps();

      // Step 3: Additional options
      const createVscodeSettings = await this.confirmVscodeSettings();
      const createGitignore = await this.confirmGitignore();

      return {
        languages,
        enableAzureDevOps,
        createVscodeSettings,
        createGitignore
      };
    } catch (error) {
      vscode.window.showErrorMessage(`Wizard failed: ${error}`);
      return null;
    }
  }

  private async selectLanguages(): Promise<string[] | null> {
    const languageOptions = [
      { label: 'Python', description: 'Python development instructions', picked: true },
      { label: 'TypeScript', description: 'TypeScript 5 ES2022 instructions', picked: true },
      { label: 'C#', description: 'C# development instructions', picked: true },
      { label: 'React', description: 'React.js development instructions', picked: true },
      { label: 'Bicep', description: 'Azure Bicep code best practices', picked: true },
      { label: '.NET Framework', description: '.NET Framework instructions', picked: true },
      { label: 'Azure DevOps Pipelines', description: 'Azure DevOps pipeline instructions', picked: true },
      { label: 'Markdown', description: 'Markdown writing instructions', picked: true
    ];

    const selected = await vscode.window.showQuickPick(languageOptions, {
      canPickMany: true,
      placeHolder: 'Select programming languages and frameworks for your project',
      title: 'Nexkit Project Initialization - Step 1: Languages'
    });

    if (!selected) {
      return null;
    }

    return selected.map(item => item.label.toLowerCase().replace(/[^a-z]/g, ''));
  }

  private async confirmAzureDevOps(): Promise<boolean> {
    const result = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Enable Azure DevOps MCP for project-specific Azure integration?',
      title: 'Nexkit Project Initialization - Step 2: Azure DevOps MCP'
    });

    return result === 'Yes';
  }

  private async confirmVscodeSettings(): Promise<boolean> {
    const result = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Create .vscode/settings.json with recommended settings?',
      title: 'Nexkit Project Initialization - Step 3: VS Code Settings'
    });

    return result === 'Yes';
  }

  private async confirmGitignore(): Promise<boolean> {
    const result = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Create .gitignore file?',
      title: 'Nexkit Project Initialization - Step 4: Git Ignore'
    });

    return result === 'Yes';
  }
}