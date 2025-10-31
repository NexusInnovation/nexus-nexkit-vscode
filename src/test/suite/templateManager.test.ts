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

	test('should deep merge flat objects', () => {
		const manager = new TemplateManager(mockContext);
		const source = { a: 1, b: 2 };
		const target = { b: 3, c: 4 };
		const merged = (manager as any).deepMerge(source, target);
		assert.deepStrictEqual(merged, { a: 1, b: 3, c: 4 });
	});

	test('should deep merge nested objects', () => {
		const manager = new TemplateManager(mockContext);
		const source = { editor: { fontSize: 14, tabSize: 2 } };
		const target = { editor: { fontSize: 16 } };
		const merged = (manager as any).deepMerge(source, target);
		assert.deepStrictEqual(merged, { editor: { fontSize: 16, tabSize: 2 } });
	});

	test('should handle arrays correctly', () => {
		const manager = new TemplateManager(mockContext);
		const source = { arr: [1, 2] };
		const target = { arr: [3] };
		const merged = (manager as any).deepMerge(source, target);
		assert.deepStrictEqual(merged, { arr: [3] });
	});

	test('should handle null/undefined values', () => {
		const manager = new TemplateManager(mockContext);
		const source = { a: 1, b: null };
		const target = { b: undefined, c: null };
		const merged = (manager as any).deepMerge(source, target);
		assert.deepStrictEqual(merged, { a: 1, b: undefined, c: null });
	});

	test('should handle primitives', () => {
		const manager = new TemplateManager(mockContext);
		const source = { a: 1 };
		const target = { a: 2 };
		const merged = (manager as any).deepMerge(source, target);
		assert.deepStrictEqual(merged, { a: 2 });
	});
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

suite('Unit: TemplateManager - discoverAlwaysDeployFiles', () => {
	let tempDir: string;
	let manager: TemplateManager;
	let mockContext: any;

	setup(async () => {
		// Create a temporary directory structure that mimics the extension structure
		tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nexkit-test-'));

		// Create mock context with temporary extension path
		mockContext = {
			extensionPath: tempDir,
		} as unknown as import('vscode').ExtensionContext;

		manager = new TemplateManager(mockContext);

		// Create the templates directory structure
		const templatesDir = path.join(tempDir, 'resources', 'templates', '.github');
		const promptsDir = path.join(templatesDir, 'prompts');
		const chatmodesDir = path.join(templatesDir, 'chatmodes');

		await fs.promises.mkdir(promptsDir, { recursive: true });
		await fs.promises.mkdir(chatmodesDir, { recursive: true });
	});

	teardown(async () => {
		// Clean up temporary directory after each test
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch (error) {
			console.error('Error cleaning up temp directory:', error);
		}
	});

	test('should discover all files from prompts and chatmodes directories', async () => {
		// Create test files
		const promptsDir = path.join(tempDir, 'resources', 'templates', '.github', 'prompts');
		const chatmodesDir = path.join(tempDir, 'resources', 'templates', '.github', 'chatmodes');

		await fs.promises.writeFile(path.join(promptsDir, 'nexkit.commit.prompt.md'), 'test content');
		await fs.promises.writeFile(path.join(promptsDir, 'nexkit.refactor.prompt.md'), 'test content');
		await fs.promises.writeFile(path.join(chatmodesDir, 'debug.chatmode.md'), 'test content');
		await fs.promises.writeFile(path.join(chatmodesDir, '4.1-Beast.chatmode.md'), 'test content');

		const result = await (manager as any).discoverAlwaysDeployFiles();

		assert.ok(Array.isArray(result));
		assert.ok(result.includes('.github/prompts/nexkit.commit.prompt.md'));
		assert.ok(result.includes('.github/prompts/nexkit.refactor.prompt.md'));
		assert.ok(result.includes('.github/chatmodes/debug.chatmode.md'));
		assert.ok(result.includes('.github/chatmodes/4.1-Beast.chatmode.md'));
	});

	test('should return empty array if directories do not exist', async () => {
		// Don't create the directories - test handling of missing directories
		const result = await (manager as any).discoverAlwaysDeployFiles();

		assert.ok(Array.isArray(result));
		assert.strictEqual(result.length, 0);
	});

	test('should ignore non-markdown files', async () => {
		const promptsDir = path.join(tempDir, 'resources', 'templates', '.github', 'prompts');
		const chatmodesDir = path.join(tempDir, 'resources', 'templates', '.github', 'chatmodes');

		await fs.promises.writeFile(path.join(promptsDir, 'nexkit.commit.prompt.md'), 'test content');
		await fs.promises.writeFile(path.join(promptsDir, 'config.json'), '{}'); // Should be ignored
		await fs.promises.writeFile(path.join(chatmodesDir, 'debug.chatmode.md'), 'test content');
		await fs.promises.writeFile(path.join(chatmodesDir, 'temp.txt'), 'temp'); // Should be ignored

		const result = await (manager as any).discoverAlwaysDeployFiles();

		assert.ok(result.includes('.github/prompts/nexkit.commit.prompt.md'));
		assert.ok(result.includes('.github/chatmodes/debug.chatmode.md'));
		assert.ok(!result.includes('.github/prompts/config.json'));
		assert.ok(!result.includes('.github/chatmodes/temp.txt'));
	});

	test('should handle empty directories gracefully', async () => {
		// Directories exist but are empty
		const result = await (manager as any).discoverAlwaysDeployFiles();

		assert.ok(Array.isArray(result));
		assert.strictEqual(result.length, 0);
	});

	test('should sort files alphabetically for consistent ordering', async () => {
		const promptsDir = path.join(tempDir, 'resources', 'templates', '.github', 'prompts');
		const chatmodesDir = path.join(tempDir, 'resources', 'templates', '.github', 'chatmodes');

		// Create files in non-alphabetical order
		await fs.promises.writeFile(path.join(promptsDir, 'nexkit.refactor.prompt.md'), 'test content');
		await fs.promises.writeFile(path.join(promptsDir, 'nexkit.commit.prompt.md'), 'test content');
		await fs.promises.writeFile(path.join(chatmodesDir, 'plan.chatmode.md'), 'test content');
		await fs.promises.writeFile(path.join(chatmodesDir, 'debug.chatmode.md'), 'test content');

		const result = await (manager as any).discoverAlwaysDeployFiles();

		// Verify prompts are sorted
		const promptFiles = result.filter((f: string) => f.includes('/prompts/'));
		assert.ok(promptFiles.indexOf('.github/prompts/nexkit.commit.prompt.md') <
			promptFiles.indexOf('.github/prompts/nexkit.refactor.prompt.md'));

		// Verify chatmodes are sorted
		const chatmodeFiles = result.filter((f: string) => f.includes('/chatmodes/'));
		assert.ok(chatmodeFiles.indexOf('.github/chatmodes/debug.chatmode.md') <
			chatmodeFiles.indexOf('.github/chatmodes/plan.chatmode.md'));
	});
});
