// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TemplateManager, DeploymentConfig } from './templateManager';
import { InitWizard, InitWizardResult } from './initWizard';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Nexkit extension activated!');

	const templateManager = new TemplateManager(context);

	// Register commands
	const initProjectDisposable = vscode.commands.registerCommand('nexkit-vscode.initProject', async () => {
		try {
			// Check if already initialized
			const isInitialized = vscode.workspace.getConfiguration('nexkit').get('workspace.initialized', false);
			if (isInitialized) {
				const result = await vscode.window.showWarningMessage(
					'Workspace already initialized with Nexkit. Re-initialize?',
					'Yes', 'No'
				);
				if (result !== 'Yes') {
					return;
				}
			}

			// Run initialization wizard
			const wizard = new InitWizard();
			const wizardResult = await wizard.run();
			if (!wizardResult) {
				return; // User cancelled
			}

			// Show progress
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Initializing Nexkit project...',
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 10, message: 'Backing up existing templates...' });

				// Backup existing .github directory if it exists
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (workspaceFolder) {
					const githubPath = vscode.Uri.joinPath(workspaceFolder.uri, '.github').fsPath;
					const backupPath = await templateManager.backupDirectory(githubPath);
					if (backupPath) {
						console.log(`Backed up existing templates to: ${backupPath}`);
					}
				}

				progress.report({ increment: 30, message: 'Preparing deployment configuration...' });

				// Create deployment config based on wizard results
				const deploymentConfig: DeploymentConfig = {
					alwaysDeploy: [
						'.github/prompts/commit.md',
						'.github/prompts/document.md',
						'.github/prompts/implement.md',
						'.github/prompts/refine.md',
						'.github/prompts/review.md',
						'.github/chatmodes/debug.chatmode.md',
						'.github/chatmodes/plan.chatmode.md',
						'.github/copilot-instructions.md'
					],
					conditionalDeploy: {
						'instructions.python': wizardResult.languages.includes('python') ? ['.github/instructions/python.instructions.md'] : [],
						'instructions.typescript': wizardResult.languages.includes('typescript') ? ['.github/instructions/typescript-5-es2022.instructions.md'] : [],
						'instructions.csharp': wizardResult.languages.includes('csharp') ? ['.github/instructions/csharp.instructions.md'] : [],
						'instructions.reactjs': wizardResult.languages.includes('react') ? ['.github/instructions/reactjs.instructions.md'] : [],
						'instructions.bicep': wizardResult.languages.includes('bicep') ? ['.github/instructions/bicep-code-best-practices.instructions.md'] : [],
						'instructions.dotnetFramework': wizardResult.languages.includes('netframework') ? ['.github/instructions/dotnet-framework.instructions.md'] : [],
						'instructions.markdown': wizardResult.languages.includes('markdown') ? ['.github/instructions/markdown.instructions.md'] : [],
						'instructions.azureDevOpsPipelines': wizardResult.languages.includes('azuredevopspipelines') ? ['.github/instructions/azure-devops-pipelines.instructions.md'] : []
					},
					workspaceMCPs: wizardResult.enableAzureDevOps ? ['azureDevOps'] : []
				};

				progress.report({ increment: 40, message: 'Deploying templates...' });

				// Deploy templates
				await templateManager.deployTemplates(deploymentConfig);

				progress.report({ increment: 20, message: 'Updating workspace settings...' });

				// Update workspace settings
				const config = vscode.workspace.getConfiguration('nexkit');
				await config.update('workspace.initialized', true, vscode.ConfigurationTarget.Workspace);
				await config.update('workspace.languages', wizardResult.languages, vscode.ConfigurationTarget.Workspace);
				await config.update('workspace.mcpServers', deploymentConfig.workspaceMCPs, vscode.ConfigurationTarget.Workspace);

				// Update init settings based on wizard
				await config.update('init.createVscodeSettings', wizardResult.createVscodeSettings, vscode.ConfigurationTarget.Workspace);
				await config.update('init.createGitignore', wizardResult.createGitignore, vscode.ConfigurationTarget.Workspace);
			});

			vscode.window.showInformationMessage('Nexkit project initialized successfully!');

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to initialize project: ${error}`);
		}
	});

	const updateTemplatesDisposable = vscode.commands.registerCommand('nexkit-vscode.updateTemplates', () => {
		vscode.window.showInformationMessage('Update templates functionality coming soon...');
	});

	const checkVersionDisposable = vscode.commands.registerCommand('nexkit-vscode.checkVersion', () => {
		vscode.window.showInformationMessage('Check version functionality coming soon...');
	});

	const installUserMCPsDisposable = vscode.commands.registerCommand('nexkit-vscode.installUserMCPs', () => {
		vscode.window.showInformationMessage('Install user MCPs functionality coming soon...');
	});

	const configureAzureDevOpsDisposable = vscode.commands.registerCommand('nexkit-vscode.configureAzureDevOps', () => {
		vscode.window.showInformationMessage('Configure Azure DevOps functionality coming soon...');
	});

	const openSettingsDisposable = vscode.commands.registerCommand('nexkit-vscode.openSettings', () => {
		vscode.window.showInformationMessage('Open settings functionality coming soon...');
	});

	const restoreBackupDisposable = vscode.commands.registerCommand('nexkit-vscode.restoreBackup', () => {
		vscode.window.showInformationMessage('Restore backup functionality coming soon...');
	});

	context.subscriptions.push(
		initProjectDisposable,
		updateTemplatesDisposable,
		checkVersionDisposable,
		installUserMCPsDisposable,
		configureAzureDevOpsDisposable,
		openSettingsDisposable,
		restoreBackupDisposable
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
