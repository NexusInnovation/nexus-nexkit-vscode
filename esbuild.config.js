/**
 * esbuild configuration for Nexkit VS Code Extension
 * Bundles extension code into a single optimized output file
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
let staticWatchersRegistered = false;

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log("[watch] build finished");
    });
  },
};

/**
 * Copy static files from source to destination
 */
function copyStaticFiles() {
  const staticConfigs = [
    {
      sourceDir: path.join(__dirname, "src", "features", "panel-ui", "webview"),
      outputDir: path.join(__dirname, "out", "webview"),
      filesToCopy: ["index.html", "styles.css"],
      staticSubFolder: "static",
    }
  ];

  staticConfigs.forEach((config) => {
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }

    config.filesToCopy.forEach((file) => {
      const source = path.join(config.sourceDir, file);
      const dest = path.join(config.outputDir, file);
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, dest);
        console.log(`[copy] ${file} -> ${path.relative(__dirname, config.outputDir)}/${file}`);
      }
    });

    if (config.staticSubFolder) {
      const staticSourceDir = path.join(config.sourceDir, config.staticSubFolder);
      const staticOutputDir = path.join(config.outputDir, config.staticSubFolder);

      if (!fs.existsSync(staticOutputDir)) {
        fs.mkdirSync(staticOutputDir, { recursive: true });
      }

      if (fs.existsSync(staticSourceDir)) {
        const staticFiles = fs.readdirSync(staticSourceDir);
        staticFiles.forEach((file) => {
          const source = path.join(staticSourceDir, file);
          const dest = path.join(staticOutputDir, file);
          if (fs.statSync(source).isFile()) {
            fs.copyFileSync(source, dest);
            console.log(
              `[copy] ${config.staticSubFolder}/${file} -> ${path.relative(__dirname, staticOutputDir)}/${file}`
            );
          }
        });
      }
    }
  });
}

/**
 * Plugin to copy static webview files to output directory
 */
const copyStaticFilesPlugin = {
  name: "copy-static-files",
  setup(build) {
    build.onEnd(() => {
      copyStaticFiles();
    });
  },
};

/**
 * Plugin to watch static files and copy them when changed
 */
const watchStaticFilesPlugin = {
  name: "watch-static-files",
  setup(build) {
    build.onStart(() => {
      if (!watch) return;
      if (staticWatchersRegistered) return;

      staticWatchersRegistered = true;

      const watchConfigs = [
        {
          sourceDir: path.join(__dirname, "src", "features", "panel-ui", "webview"),
          filesToWatch: ["index.html", "styles.css"],
          staticSubFolder: "static",
        }
      ];

      watchConfigs.forEach((config) => {
        config.filesToWatch.forEach((file) => {
          const filePath = path.join(config.sourceDir, file);
          if (fs.existsSync(filePath)) {
            fs.watchFile(filePath, { interval: 500 }, (curr, prev) => {
              if (curr.mtime !== prev.mtime) {
                console.log(`[watch] ${filePath} changed`);
                copyStaticFiles();
              }
            });
          }
        });

        if (config.staticSubFolder) {
          const staticSourceDir = path.join(config.sourceDir, config.staticSubFolder);
          if (fs.existsSync(staticSourceDir)) {
            const staticFiles = fs.readdirSync(staticSourceDir);
            staticFiles.forEach((file) => {
              const filePath = path.join(staticSourceDir, file);
              if (fs.statSync(filePath).isFile()) {
                fs.watchFile(filePath, { interval: 500 }, (curr, prev) => {
                  if (curr.mtime !== prev.mtime) {
                    console.log(`[watch] ${filePath} changed`);
                    copyStaticFiles();
                  }
                });
              }
            });
          }
        }
      });
    });
  },
};

async function main() {
  // Extension bundle
  const extensionCtx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: !production, // Include original TS source in source maps
    platform: "node",
    outfile: "out/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [esbuildProblemMatcherPlugin],
  });

  // Webview bundle
  const webviewCtx = await esbuild.context({
    entryPoints: ["src/features/panel-ui/webview/main.tsx"],
    bundle: true,
    format: "iife",
    minify: production,
    sourcemap: !production,
    platform: "browser",
    outfile: "out/webview.js",
    logLevel: "silent",
    jsx: "automatic",
    jsxImportSource: "preact",
    plugins: [esbuildProblemMatcherPlugin, copyStaticFilesPlugin, watchStaticFilesPlugin],
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
