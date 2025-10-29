import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TemplateManager } from '../../templateManager';

suite('Unit: TemplateManager', () => {
	const mockContext = {
		extensionPath: __dirname,
		// Add other required properties/methods as needed
	} as unknown as import('vscode').ExtensionContext;

	test('should instantiate TemplateManager', () => {
		const manager = new TemplateManager(mockContext);
		assert.ok(manager);
	});

	test('should have deployTemplates method', () => {
		const manager = new TemplateManager(mockContext);
		assert.strictEqual(typeof manager.deployTemplates, 'function');
	});

	// Add more tests for backup/restore and error handling as needed
});

suite('Unit: TemplateManager - createGitignore', () => {
	let tempDir: string;
	let manager: TemplateManager;

	const mockContext = {
		extensionPath: __dirname,
	} as unknown as import('vscode').ExtensionContext;

	setup(async () => {
		// Create a temporary directory for each test
		tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nexkit-test-'));
		manager = new TemplateManager(mockContext);
	});

	teardown(async () => {
		// Clean up temporary directory after each test
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch (error) {
			console.error('Error cleaning up temp directory:', error);
		}
	});

	test('should create new .gitignore with NexKit section when file does not exist', async () => {
		// Access the private method via type assertion
		await (manager as any).createGitignore(tempDir);

		const gitignorePath = path.join(tempDir, '.gitignore');
		const content = await fs.promises.readFile(gitignorePath, 'utf8');

		assert.ok(content.includes('# BEGIN NexKit'));
		assert.ok(content.includes('# END NexKit'));
		assert.ok(content.includes('.specify/'));
		assert.ok(content.includes('.github/**/nexkit.*'));
		assert.ok(content.includes('.github/chatmodes/'));
		assert.ok(content.includes('.github/instructions/'));
	});

	test('should preserve existing content when adding NexKit section', async () => {
		const gitignorePath = path.join(tempDir, '.gitignore');
		const existingContent = `node_modules/
dist/
*.log`;

		await fs.promises.writeFile(gitignorePath, existingContent, 'utf8');
		await (manager as any).createGitignore(tempDir);

		const content = await fs.promises.readFile(gitignorePath, 'utf8');

		// Verify existing content is preserved
		assert.ok(content.includes('node_modules/'));
		assert.ok(content.includes('dist/'));
		assert.ok(content.includes('*.log'));

		// Verify NexKit section is added
		assert.ok(content.includes('# BEGIN NexKit'));
		assert.ok(content.includes('# END NexKit'));
		assert.ok(content.includes('.specify/'));
	});

	test('should update existing NexKit section without duplicating', async () => {
		const gitignorePath = path.join(tempDir, '.gitignore');
		const existingContent = `node_modules/

# BEGIN NexKit
.old-pattern/
# END NexKit

dist/`;

		await fs.promises.writeFile(gitignorePath, existingContent, 'utf8');
		await (manager as any).createGitignore(tempDir);

		const content = await fs.promises.readFile(gitignorePath, 'utf8');

		// Verify existing content is preserved
		assert.ok(content.includes('node_modules/'));
		assert.ok(content.includes('dist/'));

		// Verify NexKit section is updated (not duplicated)
		const beginCount = (content.match(/# BEGIN NexKit/g) || []).length;
		assert.strictEqual(beginCount, 1, 'Should have only one BEGIN marker');

		const endCount = (content.match(/# END NexKit/g) || []).length;
		assert.strictEqual(endCount, 1, 'Should have only one END marker');

		// Verify new patterns are present
		assert.ok(content.includes('.specify/'));
		assert.ok(content.includes('.github/**/nexkit.*'));

		// Verify old pattern is replaced
		assert.ok(!content.includes('.old-pattern/'));
	});

	test('should be idempotent - running multiple times produces same result', async () => {
		const gitignorePath = path.join(tempDir, '.gitignore');
		const existingContent = `node_modules/
dist/`;

		await fs.promises.writeFile(gitignorePath, existingContent, 'utf8');

		// Run createGitignore multiple times
		await (manager as any).createGitignore(tempDir);
		const content1 = await fs.promises.readFile(gitignorePath, 'utf8');

		await (manager as any).createGitignore(tempDir);
		const content2 = await fs.promises.readFile(gitignorePath, 'utf8');

		await (manager as any).createGitignore(tempDir);
		const content3 = await fs.promises.readFile(gitignorePath, 'utf8');

		// All runs should produce identical content
		assert.strictEqual(content1, content2);
		assert.strictEqual(content2, content3);
	});

	test('should handle file without trailing newline', async () => {
		const gitignorePath = path.join(tempDir, '.gitignore');
		const existingContent = 'node_modules/'; // No trailing newline

		await fs.promises.writeFile(gitignorePath, existingContent, 'utf8');
		await (manager as any).createGitignore(tempDir);

		const content = await fs.promises.readFile(gitignorePath, 'utf8');

		// Verify proper formatting
		assert.ok(content.includes('node_modules/'));
		assert.ok(content.includes('# BEGIN NexKit'));
		
		// Verify no double newlines or formatting issues
		assert.ok(!content.includes('\n\n\n'));
	});

	test('should handle empty existing .gitignore', async () => {
		const gitignorePath = path.join(tempDir, '.gitignore');
		await fs.promises.writeFile(gitignorePath, '', 'utf8');

		await (manager as any).createGitignore(tempDir);

		const content = await fs.promises.readFile(gitignorePath, 'utf8');

		// Should just contain NexKit section
		assert.ok(content.includes('# BEGIN NexKit'));
		assert.ok(content.includes('# END NexKit'));
		assert.ok(content.includes('.specify/'));
	});
});
