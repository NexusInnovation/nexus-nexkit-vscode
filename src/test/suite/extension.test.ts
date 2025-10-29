import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Unit: Extension Activation', () => {
	vscode.window.showInformationMessage('Running Nexkit extension tests');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('nexusinno.nexkit-vscode'));
	});

	test('Should activate extension', async () => {
		const ext = vscode.extensions.getExtension('nexusinno.nexkit-vscode');
		assert.ok(ext);
		await ext!.activate();
		assert.strictEqual(ext!.isActive, true);
	});

	test('Commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const nexkitCommands = [
			'nexkit-vscode.initProject',
			'nexkit-vscode.updateTemplates',
			'nexkit-vscode.checkExtensionUpdate',
			'nexkit-vscode.installUserMCPs',
			'nexkit-vscode.configureAzureDevOps',
			'nexkit-vscode.openSettings',
			'nexkit-vscode.restoreBackup',
		];

		nexkitCommands.forEach((cmd) => {
			assert.ok(
				commands.includes(cmd),
				`Command ${cmd} should be registered`
			);
		});
	});
});
