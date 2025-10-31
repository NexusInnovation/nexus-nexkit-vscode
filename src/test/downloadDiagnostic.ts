import * as vscode from 'vscode';

/**
 * Simple diagnostic script to test GitHub release downloads
 */
async function testGitHubDownload() {
    const testUrl = 'https://github.com/NexusInnovation/nexkit-vscode/releases/download/v0.3.7/nexkit-vscode.vsix';

    try {
        // Get authentication session
        console.log('Getting GitHub authentication session...');
        const session = await vscode.authentication.getSession(
            'github',
            ['repo'],
            { createIfNone: true, silent: false }
        );

        if (!session) {
            console.log('❌ No GitHub session available');
            return;
        }

        console.log('✅ GitHub session obtained');

        const headers = {
            'User-Agent': 'Nexkit-VSCode-Extension',
            'Accept': 'application/octet-stream',
            'Authorization': `Bearer ${session.accessToken}`
        };

        // Test 1: Direct fetch with manual redirect handling
        console.log('\n🔍 Test 1: Direct fetch with manual redirect handling');
        const response1 = await fetch(testUrl, {
            headers,
            redirect: 'manual'
        });

        console.log(`Status: ${response1.status}`);
        console.log(`Status Text: ${response1.statusText}`);

        if (response1.status >= 300 && response1.status < 400) {
            const location = response1.headers.get('location');
            console.log(`🔄 Redirect to: ${location}`);

            if (location) {
                console.log('\n🔍 Test 2: Following redirect with Auth header');
                const response2 = await fetch(location, {
                    headers,
                    redirect: 'manual'
                });

                console.log(`Redirect Status: ${response2.status}`);
                console.log(`Redirect Status Text: ${response2.statusText}`);

                if (response2.ok) {
                    const contentLength = response2.headers.get('content-length');
                    console.log(`✅ Success! Content length: ${contentLength}`);
                }

                console.log('\n🔍 Test 3: Following redirect WITHOUT Auth header');
                const headersNoAuth = {
                    'User-Agent': 'Nexkit-VSCode-Extension',
                    'Accept': 'application/octet-stream'
                };

                const response3 = await fetch(location, {
                    headers: headersNoAuth,
                    redirect: 'manual'
                });

                console.log(`No-Auth Status: ${response3.status}`);
                console.log(`No-Auth Status Text: ${response3.statusText}`);

                if (response3.ok) {
                    const contentLength = response3.headers.get('content-length');
                    console.log(`✅ Success without auth! Content length: ${contentLength}`);
                }
            }
        }

        // Test 4: Let fetch handle redirects automatically
        console.log('\n🔍 Test 4: Automatic redirect handling');
        const response4 = await fetch(testUrl, {
            headers,
            redirect: 'follow'
        });

        console.log(`Auto-redirect Status: ${response4.status}`);
        console.log(`Auto-redirect Final URL: ${response4.url}`);

        if (response4.ok) {
            const contentLength = response4.headers.get('content-length');
            console.log(`✅ Auto-redirect Success! Content length: ${contentLength}`);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Export for use as a VS Code command
export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('nexkit.testGitHubDownload', testGitHubDownload);
    context.subscriptions.push(disposable);

    // Run immediately when activated
    testGitHubDownload();
}

export function deactivate() { }