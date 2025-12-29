/**
 * Test runner for Nexkit VS Code Extension
 * Configures @vscode/test-electron for headless extension testing
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // Use isolated directories per run to avoid VS Code mutex/profile conflicts
    // (especially on Windows where a shared user-data-dir can cause failures).
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-nexkit-vscode-test-"));
    const userDataDir = path.join(baseDir, "user-data");
    const extensionsDir = path.join(baseDir, "extensions");
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(extensionsDir, { recursive: true });

    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, "../");

    // The path to test runner (this file compiles to out/test/runTest.js)
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        "--disable-extensions", // Disable other extensions during tests
        "--disable-gpu",
      ],
    });
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

main();
