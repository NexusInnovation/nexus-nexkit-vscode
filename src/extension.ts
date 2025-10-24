// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TemplateManager, DeploymentConfig } from './templateManager';
import { InitWizard, InitWizardResult } from './initWizard';
import { MCPConfigManager } from './mcpConfigManager';

/**
 * Check for required MCP servers and show notification if missing
 */
async function checkRequiredMCPs(mcpConfigManager: MCPConfigManager): Promise<void> {
	try {
		const { missing } = await mcpConfigManager.checkRequiredUserMCPs();

		if (missing.length > 0) {
			// Check if user has dismissed this notification before
			const config = vscode.workspace.getConfiguration('nexkit');
			const dismissed = config.get('mcpSetup.dismissed', false);

			if (!dismissed) {
				const result = await vscode.window.showInformationMessage(
					`Nexkit requires MCP servers: ${missing.join(', ')}. Install now?`,
					'Install', 'Later', 'Don\'t Ask Again'
				);

				if (result === 'Install') {
					vscode.commands.executeCommand('nexkit-vscode.installUserMCPs');
				} else if (result === 'Don\'t Ask Again') {
					await config.update('mcpSetup.dismissed', true, vscode.ConfigurationTarget.Global);
				}
			}
		}
	} catch (error) {
		console.error('Error checking MCP servers:', error);
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Nexkit extension activated!');

	const templateManager = new TemplateManager(context);
	const mcpConfigManager = new MCPConfigManager();

	// Check for required MCP servers on activation
	checkRequiredMCPs(mcpConfigManager);

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

	const updateTemplatesDisposable = vscode.commands.registerCommand('nexkit-vscode.updateTemplates', async () => {
		try {
			// Placeholder for update logic - will be implemented in Phase 4
			vscode.window.showInformationMessage('Template update functionality will be implemented in Phase 4: GitHub Integration & Auto-Update');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update templates: ${error}`);
		}
	});

	const checkVersionDisposable = vscode.commands.registerCommand('nexkit-vscode.checkVersion', async () => {
		try {
			// Placeholder for version check logic - will be implemented in Phase 4
			const currentVersion = vscode.workspace.getConfiguration('nexkit').get('templates.version', 'unknown');
			vscode.window.showInformationMessage(`Current template version: ${currentVersion}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to check version: ${error}`);
		}
	});

	const installUserMCPsDisposable = vscode.commands.registerCommand('nexkit-vscode.installUserMCPs', async () => {
		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Installing user MCP servers...',
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 25, message: 'Checking existing configuration...' });

				// Check what's already configured
				const { configured, missing } = await mcpConfigManager.checkRequiredUserMCPs();

				if (missing.length === 0) {
					vscode.window.showInformationMessage('All required MCP servers are already configured!');
					return;
				}

				progress.report({ increment: 50, message: `Installing ${missing.join(', ')}...` });

				// Install missing servers
				for (const server of missing) {
					if (server === 'context7') {
						await mcpConfigManager.addUserMCPServer('context7', {
							command: 'npx',
							args: ['-y', '@context7/mcp-server']
						});
					} else if (server === 'sequentialthinking') {
						await mcpConfigManager.addUserMCPServer('sequentialthinking', {
							command: 'npx',
							args: ['-y', '@sequentialthinking/mcp-server']
						});
					}
				}

				progress.report({ increment: 25, message: 'Installation complete' });
			});

			vscode.window.showInformationMessage(
				'User MCP servers installed successfully! Please reload VS Code for changes to take effect.',
				'Reload Now'
			).then(selection => {
				if (selection === 'Reload Now') {
					vscode.commands.executeCommand('workbench.action.reloadWindow');
				}
			});

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to install MCP servers: ${error}`);
		}
	});	const configureAzureDevOpsDisposable = vscode.commands.registerCommand('nexkit-vscode.configureAzureDevOps', () => {
		vscode.window.showInformationMessage('Configure Azure DevOps functionality coming soon...');
	});

	const openSettingsDisposable = vscode.commands.registerCommand('nexkit-vscode.openSettings', async () => {
		try {
			// Open VS Code settings with nexkit filter
			await vscode.commands.executeCommand('workbench.action.openSettings', 'nexkit');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open settings: ${error}`);
		}
	});

	const restoreBackupDisposable = vscode.commands.registerCommand('nexkit-vscode.restoreBackup', async () => {
		try {
			// Placeholder for backup restore logic - will be implemented in Phase 4
			vscode.window.showInformationMessage('Backup restore functionality will be implemented in Phase 4: GitHub Integration & Auto-Update');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to restore backup: ${error}`);
		}
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
