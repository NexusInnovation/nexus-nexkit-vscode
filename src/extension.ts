// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TemplateManager, DeploymentConfig } from './templateManager';
import { InitWizard, InitWizardResult } from './initWizard';
import { MCPConfigManager } from './mcpConfigManager';
import { VersionManager } from './versionManager';
import { GitHubReleaseService } from './githubReleaseService';
import { NexkitPanel } from './nexkitPanel';
import { ExtensionUpdateManager } from './extensionUpdateManager';

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
		// Get the extension version from package.json
		const extensionVersion = vscode.extensions.getExtension('nexusinno.nexkit-vscode')?.packageJSON.version || '0.0.0';
		const currentTemplateVersion = versionManager.getCurrentVersion();
		const templateUpdateCheck = await versionManager.isUpdateAvailable();

		// Check for extension updates
		const extensionUpdateManager = new ExtensionUpdateManager();
		const extensionUpdateInfo = await extensionUpdateManager.checkForExtensionUpdate();

		// Prioritize showing extension updates over template updates
		if (extensionUpdateInfo) {
			statusBarItem.text = `$(cloud-download) Nexkit v${extensionVersion}`;
			statusBarItem.tooltip = `Extension update available: ${extensionUpdateInfo.latestVersion}. Click to update.`;
			statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
			statusBarItem.command = 'nexkit-vscode.checkExtensionUpdate';
		} else if (templateUpdateCheck.available) {
			statusBarItem.text = `$(arrow-up) Nexkit v${extensionVersion}`;
			statusBarItem.tooltip = `Template update available: ${templateUpdateCheck.latestVersion} (current: ${currentTemplateVersion}). Click to update.`;
			statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			statusBarItem.command = 'nexkit-vscode.checkVersion';
		} else {
			statusBarItem.text = `$(check) Nexkit v${extensionVersion}`;
			statusBarItem.tooltip = `Extension v${extensionVersion} and templates v${currentTemplateVersion} are up to date. Click to check for updates.`;
			statusBarItem.backgroundColor = undefined;
			statusBarItem.command = 'nexkit-vscode.checkVersion';
		}

		statusBarItem.show();
	} catch (error) {
		console.error('Error updating status bar:', error);
		statusBarItem.text = `$(warning) Nexkit`;
		statusBarItem.tooltip = 'Error checking update status';
		statusBarItem.command = 'nexkit-vscode.checkVersion';
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

/**
 * Check for extension updates on activation
 */
async function checkForExtensionUpdates(): Promise<void> {
	try {
		const extensionUpdateManager = new ExtensionUpdateManager();

		if (extensionUpdateManager.shouldCheckForExtensionUpdates()) {
			const updateInfo = await extensionUpdateManager.checkForExtensionUpdate();

			if (updateInfo) {
				const result = await vscode.window.showInformationMessage(
					`Nexkit extension ${updateInfo.latestVersion} available!`,
					'Update Now', 'Remind Later'
				);

				if (result === 'Update Now') {
					await extensionUpdateManager.promptUserForUpdate(updateInfo);
				}
			}

			// Update last check timestamp
			const config = vscode.workspace.getConfiguration('nexkit');
			await config.update('extension.lastUpdateCheck', Date.now(), vscode.ConfigurationTarget.Global);
		}
	} catch (error) {
		console.error('Error checking for extension updates:', error);
	}
}

/**
 * Build deployment config from current workspace settings
 */
function buildCurrentDeploymentConfig(): DeploymentConfig {
	const config = vscode.workspace.getConfiguration('nexkit');
	const languages = config.get<string[]>('workspace.languages', []);
	const mcpServers = config.get<string[]>('workspace.mcpServers', []);

	return {
		alwaysDeploy: [
			'.github/prompts/nexkit.commit.prompt.md',
			'.github/prompts/nexkit.document.prompt.md',
			'.github/prompts/nexkit.implement.prompt.md',
			'.github/prompts/nexkit.refine.prompt.md',
			'.github/prompts/nexkit.review.prompt.md',
			'.github/chatmodes/debug.chatmode.md',
			'.github/chatmodes/plan.chatmode.md'
		],
		conditionalDeploy: {
			'instructions.python': languages.includes('python') ? ['.github/instructions/python.instructions.md'] : [],
			'instructions.typescript': languages.includes('typescript') ? ['.github/instructions/typescript-5-es2022.instructions.md'] : [],
			'instructions.csharp': languages.includes('csharp') ? ['.github/instructions/csharp.instructions.md'] : [],
			'instructions.reactjs': languages.includes('react') ? ['.github/instructions/reactjs.instructions.md'] : [],
			'instructions.bicep': languages.includes('bicep') ? ['.github/instructions/bicep-code-best-practices.instructions.md'] : [],
			'instructions.dotnetFramework': languages.includes('netframework') ? ['.github/instructions/dotnet-framework.instructions.md'] : [],
			'instructions.markdown': languages.includes('markdown') ? ['.github/instructions/markdown.instructions.md'] : [],
			'instructions.azureDevOpsPipelines': languages.includes('azuredevopspipelines') ? ['.github/instructions/azure-devops-pipelines.instructions.md'] : []
		},
		workspaceMCPs: mcpServers
	};
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


	// Register NexkitPanel WebviewViewProvider for sidebar
	class NexkitPanelViewProvider implements vscode.WebviewViewProvider {
		constructor(private readonly _extensionUri: vscode.Uri) {}
		
		async resolveWebviewView(
			webviewView: vscode.WebviewView,
			context: vscode.WebviewViewResolveContext<unknown>,
			token: vscode.CancellationToken
		): Promise<void> {
			webviewView.webview.options = {
				enableScripts: true
			};
			// Use static helper to get HTML
			webviewView.webview.html = NexkitPanel.getWebviewContent(webviewView.webview, this._extensionUri);
			
			// Set up message listener
			webviewView.webview.onDidReceiveMessage(async message => {
				switch (message.command) {
					case 'ready':
						// Webview is ready - send initial version and status
						const ext = vscode.extensions.getExtension('nexusinno.nexkit-vscode');
						const version = ext?.packageJSON.version || 'Unknown';
						webviewView.webview.postMessage({ version, status: 'Ready' });
						break;
					case 'updateTemplates':
						await vscode.commands.executeCommand('nexkit-vscode.updateTemplates');
						const ext2 = vscode.extensions.getExtension('nexusinno.nexkit-vscode');
						webviewView.webview.postMessage({ 
							version: ext2?.packageJSON.version || 'Unknown', 
							status: 'Templates updated' 
						});
						break;
					case 'initProject':
						await vscode.commands.executeCommand('nexkit-vscode.initProject');
						const ext3 = vscode.extensions.getExtension('nexusinno.nexkit-vscode');
						webviewView.webview.postMessage({ 
							version: ext3?.packageJSON.version || 'Unknown', 
							status: 'Project initialized' 
						});
						break;
					case 'installUserMCPs':
						await vscode.commands.executeCommand('nexkit-vscode.installUserMCPs');
						const ext4 = vscode.extensions.getExtension('nexusinno.nexkit-vscode');
						webviewView.webview.postMessage({ 
							version: ext4?.packageJSON.version || 'Unknown', 
							status: 'User MCP servers installed' 
						});
						break;
					case 'openSettings':
						await vscode.commands.executeCommand('nexkit-vscode.openSettings');
						const ext5 = vscode.extensions.getExtension('nexusinno.nexkit-vscode');
						webviewView.webview.postMessage({ 
							version: ext5?.packageJSON.version || 'Unknown', 
							status: 'Settings opened' 
						});
						break;
				}
			});
		}
	}

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('nexkitPanelView', new NexkitPanelViewProvider(context.extensionUri), {
			webviewOptions: { retainContextWhenHidden: true }
		})
	);

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

	// Check for extension updates on activation
	checkForExtensionUpdates();

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
						'.github/prompts/nexkit.commit.prompt.md',
						'.github/prompts/nexkit.document.prompt.md',
						'.github/prompts/nexkit.implement.prompt.md',
						'.github/prompts/nexkit.refine.prompt.md',
						'.github/prompts/nexkit.review.prompt.md',
						'.github/chatmodes/debug.chatmode.md',
						'.github/chatmodes/plan.chatmode.md'
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

				// Extract templates from zip
				const extractedPath = await templateManager.extractTemplatesZip(templatesBuffer);

				// Deploy templates based on current workspace configuration
				const deploymentConfig = buildCurrentDeploymentConfig();
				await templateManager.deployFromExtractedTemplates(extractedPath, deploymentConfig);

				// Update version
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
			const templateUpdateCheck = await versionManager.isUpdateAvailable();

			// Check for extension updates
			const extensionUpdateManager = new ExtensionUpdateManager();
			const extensionUpdateInfo = await extensionUpdateManager.checkForExtensionUpdate();

			// Show extension update with priority
			if (extensionUpdateInfo) {
				const result = await vscode.window.showInformationMessage(
					`Extension update available! Current: ${extensionUpdateInfo.currentVersion}, Latest: ${extensionUpdateInfo.latestVersion}`,
					'Update Extension', 'Check Templates', 'Later'
				);

				if (result === 'Update Extension') {
					vscode.commands.executeCommand('nexkit-vscode.checkExtensionUpdate');
				} else if (result === 'Check Templates') {
					// Fall through to template check
					if (templateUpdateCheck.available) {
						vscode.window.showInformationMessage(
							`Template update available! Current: ${currentVersion}, Latest: ${templateUpdateCheck.latestVersion}`,
							'Update Now'
						).then(selection => {
							if (selection === 'Update Now') {
								vscode.commands.executeCommand('nexkit-vscode.updateTemplates');
							}
						});
					} else {
						vscode.window.showInformationMessage(`Templates are up to date (version ${currentVersion})`);
					}
				}
			} else if (templateUpdateCheck.available) {
				vscode.window.showInformationMessage(
					`Template update available! Current: ${currentVersion}, Latest: ${templateUpdateCheck.latestVersion}`,
					'Update Now'
				).then(selection => {
					if (selection === 'Update Now') {
						vscode.commands.executeCommand('nexkit-vscode.updateTemplates');
					}
				});
			} else {
				vscode.window.showInformationMessage(`Extension and templates are up to date (version ${currentVersion})`);
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
							args: ['-y', '@upstash/context7-mcp']
						});
					} else if (server === 'sequentialthinking') {
						await mcpConfigManager.addUserMCPServer('sequential-thinking', {
							command: 'npx',
							args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
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

	const checkExtensionUpdateDisposable = vscode.commands.registerCommand('nexkit-vscode.checkExtensionUpdate', async () => {
		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Checking for extension updates...',
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 30, message: 'Checking GitHub releases...' });

				const extensionUpdateManager = new ExtensionUpdateManager();
				const updateInfo = await extensionUpdateManager.checkForExtensionUpdate();

				if (!updateInfo) {
					vscode.window.showInformationMessage('Nexkit extension is up to date!');
					return;
				}

				progress.report({ increment: 70, message: 'Update available...' });

				// Prompt user for update action
				await extensionUpdateManager.promptUserForUpdate(updateInfo);
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to check for extension updates: ${error}`);
		}
	});

	context.subscriptions.push(
		initProjectDisposable,
		updateTemplatesDisposable,
		checkVersionDisposable,
		installUserMCPsDisposable,
		configureAzureDevOpsDisposable,
		openSettingsDisposable,
		restoreBackupDisposable,
		checkExtensionUpdateDisposable
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
