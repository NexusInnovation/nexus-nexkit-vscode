/**
 * Headless test runner for unit tests that do NOT require the VS Code API.
 * Runs directly via Node.js + Mocha — no Electron/VS Code instance needed.
 * Suitable for git hooks and fast local feedback.
 */

import * as path from "path";
import * as Mocha from "mocha";
import { glob } from "glob";

/**
 * Tests that can run headlessly (no direct or transitive 'vscode' dependency).
 * All other tests require the VS Code Electron host.
 */
const HEADLESS_TESTS: string[] = ["devOpsUrlParser.test.js", "fuzzySearch.test.js", "templateDiagnostics.test.js"];

async function main(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 10000,
    reporter: "spec",
  });

  const testsRoot = path.resolve(__dirname);
  const files = await glob("suite/**/*.test.js", { cwd: testsRoot });

  const headlessFiles = files.filter((f) => HEADLESS_TESTS.includes(path.basename(f)));

  for (const f of headlessFiles) {
    mocha.addFile(path.resolve(testsRoot, f));
  }

  console.log(
    `Running ${headlessFiles.length} headless tests (skipping ${files.length - headlessFiles.length} VS Code-dependent tests)\n`
  );

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        process.exitCode = 1;
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
