#!/usr/bin/env node

/**
 * Simple Node.js script to test GitHub private repo download
 * Run this outside of VS Code extension environment
 */

const testUrl = 'https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/download/v0.3.7/nexkit-vscode.vsix';

async function testGitHubDownload() {
    console.log('🔧 Testing GitHub private repository download...');
    console.log(`📍 Target URL: ${testUrl}`);

    // Get GitHub token from environment
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.log('❌ Please set GITHUB_TOKEN environment variable');
        console.log('   Example: export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx');
        return;
    }

    const headers = {
        'User-Agent': 'Nexkit-VSCode-Extension',
        'Accept': 'application/octet-stream',
        'Authorization': `Bearer ${token}`
    };

    try {
        // Test 1: Direct fetch with automatic redirects
        console.log('\n🔍 Test 1: Direct fetch with automatic redirects');
        const response1 = await fetch(testUrl, {
            headers,
            redirect: 'follow'
        });

        console.log(`Status: ${response1.status} ${response1.statusText}`);
        console.log(`Final URL: ${response1.url}`);

        if (response1.ok) {
            const contentLength = response1.headers.get('content-length');
            console.log(`✅ SUCCESS! Content length: ${contentLength}`);

            // Download a small portion to verify
            const arrayBuffer = await response1.arrayBuffer();
            console.log(`Downloaded: ${arrayBuffer.byteLength} bytes`);

            // Check if it's a valid ZIP file
            const uint8Array = new Uint8Array(arrayBuffer);
            const header = Array.from(uint8Array.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
            if (header === '504b0304') {
                console.log('✅ Valid ZIP/VSIX header detected');
            } else {
                console.log(`⚠️  Unexpected header: ${header} (expected: 504b0304)`);
            }
        } else {
            console.log(`❌ FAILED: ${response1.status} ${response1.statusText}`);
        }

        // Test 2: Manual redirect handling
        console.log('\n🔍 Test 2: Manual redirect handling');
        const response2 = await fetch(testUrl, {
            headers,
            redirect: 'manual'
        });

        console.log(`Status: ${response2.status} ${response2.statusText}`);

        if (response2.status >= 300 && response2.status < 400) {
            const location = response2.headers.get('location');
            console.log(`🔄 Redirect to: ${location}`);

            if (location) {
                // Follow the redirect
                const response3 = await fetch(location, {
                    headers,
                    redirect: 'follow'
                });

                console.log(`Redirect result: ${response3.status} ${response3.statusText}`);
                console.log(`Final URL: ${response3.url}`);

                if (response3.ok) {
                    const contentLength = response3.headers.get('content-length');
                    console.log(`✅ Manual redirect SUCCESS! Content length: ${contentLength}`);
                }
            }
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

if (require.main === module) {
    testGitHubDownload();
}