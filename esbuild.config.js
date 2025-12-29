/**
 * esbuild configuration for Nexkit VS Code Extension
 * Bundles extension code into a single optimized output file
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd(result => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * Plugin to copy static webview files to output directory
 */
const copyStaticFilesPlugin = {
	name: 'copy-static-files',
	setup(build) {
		build.onEnd(() => {
			const webviewSourceDir = path.join(__dirname, 'src', 'features', 'panel-ui', 'webview');
			const webviewOutputDir = path.join(__dirname, 'out', 'webview');

			// Create output directory if it doesn't exist
			if (!fs.existsSync(webviewOutputDir)) {
				fs.mkdirSync(webviewOutputDir, { recursive: true });
			}

			// Copy HTML and CSS files
			const filesToCopy = ['index.html', 'styles.css'];
			filesToCopy.forEach(file => {
				const source = path.join(webviewSourceDir, file);
				const dest = path.join(webviewOutputDir, file);
				if (fs.existsSync(source)) {
					fs.copyFileSync(source, dest);
					console.log(`[copy] ${file} -> out/webview/${file}`);
				}
			});
		});
	},
};

async function main() {
	// Extension bundle
	const extensionCtx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: !production, // Include original TS source in source maps
		platform: 'node',
		outfile: 'out/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	// Webview bundle
	const webviewCtx = await esbuild.context({
		entryPoints: ['src/features/panel-ui/webview/main.tsx'],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		platform: 'browser',
		outfile: 'out/webview.js',
		logLevel: 'silent',
		jsx: 'automatic',
		jsxImportSource: 'preact',
		plugins: [
			esbuildProblemMatcherPlugin,
			copyStaticFilesPlugin,
		],
	});

	if (watch) {
		await extensionCtx.watch();
		await webviewCtx.watch();
	} else {
		await extensionCtx.rebuild();
		await webviewCtx.rebuild();
		await extensionCtx.dispose();
		await webviewCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
