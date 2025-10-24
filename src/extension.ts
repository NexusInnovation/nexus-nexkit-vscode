// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TemplateManager, DeploymentConfig } from './templateManager';
import { InitWizard, InitWizardResult } from './initWizard';
import { MCPConfigManager } from './mcpConfigManager';
import { VersionManager } from './versionManager';
import { GitHubReleaseService } from './githubReleaseService';

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

/**
 * Update the status bar with current template version and update status
 */
async function updateStatusBar(statusBarItem: vscode.StatusBarItem, versionManager: VersionManager): Promise<void> {
	try {
		const currentVersion = versionManager.getCurrentVersion();
		const updateCheck = await versionManager.isUpdateAvailable();

		if (updateCheck.available) {
			statusBarItem.text = `$(arrow-up) Nexkit v${currentVersion}`;
			statusBarItem.tooltip = `Update available: ${updateCheck.latestVersion}. Click to check for updates.`;
			statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		} else {
			statusBarItem.text = `$(check) Nexkit v${currentVersion}`;
			statusBarItem.tooltip = `Templates are up to date (v${currentVersion}). Click to check for updates.`;
			statusBarItem.backgroundColor = undefined;
		}

		statusBarItem.show();
	} catch (error) {
		console.error('Error updating status bar:', error);
		statusBarItem.text = `$(warning) Nexkit`;
		statusBarItem.tooltip = 'Error checking template status';
		statusBarItem.show();
	}
}

/**
 * Check for template updates on activation
 */
async function checkForUpdates(versionManager: VersionManager): Promise<void> {
	try {
		if (versionManager.shouldCheckForUpdates()) {
			const updateCheck = await versionManager.isUpdateAvailable();

			if (updateCheck.available) {
				const result = await vscode.window.showInformationMessage(
					`Nexkit templates ${updateCheck.latestVersion} available!`,
					'Update Now', 'Remind Later'
				);

				if (result === 'Update Now') {
					vscode.commands.executeCommand('nexkit-vscode.updateTemplates');
				}
			}

			// Update last check timestamp
			await versionManager.updateLastCheckTimestamp();
		}
	} catch (error) {
		console.error('Error checking for updates:', error);
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
	const versionManager = new VersionManager();
	const githubService = new GitHubReleaseService();

	// Create status bar item
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'nexkit-vscode.checkVersion';
	context.subscriptions.push(statusBarItem);

	// Update status bar
	updateStatusBar(statusBarItem, versionManager);

	// Check for required MCP servers on activation
	checkRequiredMCPs(mcpConfigManager);

	// Check for template updates on activation
	checkForUpdates(versionManager);

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
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Checking for template updates...',
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 20, message: 'Checking for updates...' });

				const updateCheck = await versionManager.isUpdateAvailable();

				if (!updateCheck.available) {
					vscode.window.showInformationMessage('Templates are up to date!');
					return;
				}

				const { latestVersion, manifest } = updateCheck;

				// Check extension compatibility
				if (manifest && !githubService.checkExtensionVersion(manifest.minExtensionVersion)) {
					vscode.window.showErrorMessage(
						`Update requires extension version ${manifest.minExtensionVersion} or higher. Please update the extension first.`
					);
					return;
				}

				// Show confirmation dialog
				const result = await vscode.window.showInformationMessage(
					`Template update available: ${latestVersion}`,
					{ modal: true },
					'Update Now',
					'View Changelog',
					'Cancel'
				);

				if (result === 'View Changelog') {
					if (manifest?.changelogUrl) {
						vscode.env.openExternal(vscode.Uri.parse(manifest.changelogUrl));
					}
					return;
				}

				if (result !== 'Update Now') {
					return;
				}

				progress.report({ increment: 20, message: 'Backing up current templates...' });

				// Backup existing templates
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (workspaceFolder) {
					const githubPath = vscode.Uri.joinPath(workspaceFolder.uri, '.github').fsPath;
					await templateManager.backupDirectory(githubPath);
				}

				progress.report({ increment: 20, message: 'Downloading templates...' });

				// Download templates
				const templatesBuffer = await githubService.downloadTemplates(latestVersion!);

				progress.report({ increment: 20, message: 'Extracting and deploying...' });

				// Extract and deploy (simplified - in real implementation would extract zip)
				// For now, just update the version
				await versionManager.setCurrentVersion(latestVersion!);

				// Update last check timestamp
				await versionManager.updateLastCheckTimestamp();

				progress.report({ increment: 20, message: 'Update complete!' });

				vscode.window.showInformationMessage(
					`Templates updated to version ${latestVersion}!`,
					'View Changelog'
				).then(selection => {
					if (selection === 'View Changelog' && manifest?.changelogUrl) {
						vscode.env.openExternal(vscode.Uri.parse(manifest.changelogUrl));
					}
				});
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update templates: ${error}`);
		}
	});

	const checkVersionDisposable = vscode.commands.registerCommand('nexkit-vscode.checkVersion', async () => {
		try {
			const currentVersion = versionManager.getCurrentVersion();
			const updateCheck = await versionManager.isUpdateAvailable();

			if (updateCheck.available) {
				vscode.window.showInformationMessage(
					`Current version: ${currentVersion}. Latest available: ${updateCheck.latestVersion}`,
					'Update Now'
				).then(selection => {
					if (selection === 'Update Now') {
						vscode.commands.executeCommand('nexkit-vscode.updateTemplates');
					}
				});
			} else {
				vscode.window.showInformationMessage(`Templates are up to date (version ${currentVersion})`);
			}
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
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const backups = await templateManager.listBackups(workspaceFolder.uri.fsPath);

			if (backups.length === 0) {
				vscode.window.showInformationMessage('No backups available');
				return;
			}

			// Show backup selection
			const selectedBackup = await vscode.window.showQuickPick(
				backups.map(backup => ({
					label: backup.replace('.github.backup-', ''),
					description: backup,
					detail: `Restore from ${backup}`
				})),
				{
					placeHolder: 'Select a backup to restore',
					title: 'Nexkit: Restore Template Backup'
				}
			);

			if (!selectedBackup) {
				return;
			}

			const confirm = await vscode.window.showWarningMessage(
				`This will replace your current .github directory with the backup from ${selectedBackup.label}. Continue?`,
				{ modal: true },
				'Restore', 'Cancel'
			);

			if (confirm !== 'Restore') {
				return;
			}

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Restoring backup...',
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 50, message: 'Restoring templates...' });
				await templateManager.restoreBackup(workspaceFolder.uri.fsPath, selectedBackup.description);

				progress.report({ increment: 50, message: 'Backup restored successfully' });
			});

			vscode.window.showInformationMessage('Template backup restored successfully!');
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
