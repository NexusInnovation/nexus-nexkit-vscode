import * as assert from 'assert';
import * as vscode from 'vscode';
import { GitHubReleaseService } from '../../githubReleaseService';

suite('Unit: GitHubReleaseService', () => {
	test('should instantiate GitHubReleaseService', () => {
		// Create a mock context for testing
		const mockContext = {
			subscriptions: [],
			extensionPath: '',
			extensionUri: vscode.Uri.file(''),
			globalState: {} as any,
			workspaceState: {} as any,
			secrets: {} as any,
			extensionMode: vscode.ExtensionMode.Test,
			extension: {} as any,
			environmentVariableCollection: {} as any,
			storageUri: undefined,
			globalStorageUri: vscode.Uri.file(''),
			logUri: vscode.Uri.file(''),
			asAbsolutePath: (relativePath: string) => relativePath,
			storagePath: undefined,
			globalStoragePath: '',
			logPath: '',
			languageModelAccessInformation: {} as any
		} as unknown as vscode.ExtensionContext;

		const service = new GitHubReleaseService(mockContext);
		assert.ok(service);
	});

	test('should follow redirects when downloading vsix asset', async () => {
		// Arrange mock context
		const mockContext = {
			subscriptions: [],
			extensionPath: '',
			extensionUri: vscode.Uri.file(''),
			globalState: {} as any,
			workspaceState: {} as any,
			secrets: {} as any,
			extensionMode: vscode.ExtensionMode.Test,
			extension: {} as any,
			environmentVariableCollection: {} as any,
			storageUri: undefined,
			globalStorageUri: vscode.Uri.file(''),
			logUri: vscode.Uri.file(''),
			asAbsolutePath: (relativePath: string) => relativePath,
			storagePath: undefined,
			globalStoragePath: '',
			logPath: '',
			languageModelAccessInformation: {} as any
		} as unknown as vscode.ExtensionContext;

		const service = new GitHubReleaseService(mockContext);

		// Prepare release info with a .vsix asset
		const release = {
			tagName: 'v1.0.0',
			publishedAt: new Date().toISOString(),
			assets: [
				{ name: 'extension.vsix', browserDownloadUrl: 'https://original.example/extension.vsix', size: 123 }
			]
		};

		// Mock fetch with redirect then success
		let callIndex = 0;
		const originalFetch = (global as any).fetch;

		class MockHeaders {
			private map: Record<string, string>;
			constructor(map: Record<string, string>) { this.map = {}; for (const k of Object.keys(map)) { this.map[k.toLowerCase()] = map[k]; } }
			get(key: string) { return this.map[key.toLowerCase()] || null; }
		}

		class MockResponse {
			status: number;
			statusText: string;
			headers: MockHeaders;
			ok: boolean;
			private bodyData: Uint8Array;
			constructor(status: number, statusText: string, headers: Record<string,string>, body: Uint8Array) {
				this.status = status;
				this.statusText = statusText;
				this.headers = new MockHeaders(headers);
				this.ok = status >= 200 && status < 300;
				this.bodyData = body;
			}
			async arrayBuffer() { return this.bodyData.buffer; }
			async json() { return {}; }
		}

		(global as any).fetch = async (requestedUrl: string, options: any) => {
			if (callIndex === 0) {
				callIndex++;
				return new MockResponse(302, 'Found', { 'location': 'https://redirected.example/file.vsix' }, new Uint8Array());
			} else {
				return new MockResponse(200, 'OK', {}, new Uint8Array([1,2,3,4]));
			}
		};

		try {
			const buffer = await service.downloadVsixAsset(release);
			assert.strictEqual(buffer.byteLength, 4, 'Expected 4 bytes in downloaded vsix');
			assert.strictEqual(callIndex, 1, 'Expected exactly one redirect followed');
		} finally {
			(global as any).fetch = originalFetch;
		}
	});

	// Add more tests for release fetching and manifest parsing as needed
});
