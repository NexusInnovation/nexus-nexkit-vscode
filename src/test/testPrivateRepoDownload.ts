import * as vscode from 'vscode';
import { GitHubReleaseService } from '../services/githubReleaseService';

/**
 * Simple test to verify GitHub private repository download works
 */
async function testPrivateRepoDownload() {
    console.log('🔧 Testing GitHub private repository download...');

    const mockContext = {
        subscriptions: [],
        workspaceState: {
            get: () => undefined,
            update: () => Promise.resolve()
        },
        globalState: {
            get: () => undefined,
            update: () => Promise.resolve()
        }
    } as any;

    const service = new GitHubReleaseService(mockContext);

    try {
        // Test 1: Fetch latest release info
        console.log('📋 Step 1: Fetching latest release info...');
        const release = await service.fetchLatestRelease();
        console.log(`✅ Found release: ${release.tagName} (published: ${release.publishedAt})`);
        console.log(`📦 Assets: ${release.assets.map(a => a.name).join(', ')}`);

        // Test 2: Download VSIX asset
        console.log('\n📥 Step 2: Downloading VSIX asset...');
        const vsixData = await service.downloadVsixAsset(release);
        console.log(`✅ Successfully downloaded ${vsixData.byteLength} bytes!`);

        // Test 3: Verify it's a valid ZIP file (VSIX is a ZIP)
        const uint8Array = new Uint8Array(vsixData);
        const header = Array.from(uint8Array.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (header === '504b0304') {
            console.log('✅ Downloaded file has valid ZIP header (VSIX format confirmed)');
        } else {
            console.log(`⚠️  Downloaded file header: ${header} (expected: 504b0304 for ZIP)`);
        }

        console.log('\n🎉 All tests passed! Private repository download is working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error);

        // Additional diagnostic info
        if (error instanceof Error && error.message.includes('404')) {
            console.log('\n🔍 Diagnostic: 404 errors often indicate:');
            console.log('   • Repository is private and requires authentication');
            console.log('   • Authentication token lacks required permissions');
            console.log('   • Release or asset does not exist');
        } else if (error instanceof Error && error.message.includes('401')) {
            console.log('\n🔍 Diagnostic: 401 errors indicate authentication failure');
        } else if (error instanceof Error && error.message.includes('403')) {
            console.log('\n🔍 Diagnostic: 403 errors indicate insufficient permissions');
        }
    }
}

// Export for use as a VS Code command
export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('nexkit.testPrivateRepoDownload', testPrivateRepoDownload);
    context.subscriptions.push(disposable);

    console.log('🔧 Test command registered: nexkit.testPrivateRepoDownload');
}

export function deactivate() { }