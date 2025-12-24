/**
 * esbuild configuration for Nexkit VS Code Extension
 * Bundles extension code into a single optimized output file
 */

const esbuild = require('esbuild');

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
