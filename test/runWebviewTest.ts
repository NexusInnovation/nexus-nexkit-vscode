/**
 * Webview test runner for the Preact panel UI.
 *
 * Runs the `test/suite/webview/**` DOM tests directly under Node.js + Mocha —
 * no Electron/VS Code host needed. A happy-dom environment and a mocked
 * `acquireVsCodeApi` bridge are registered *before* any test module is loaded,
 * so Testing Library and the components find a live `window`/`document`.
 *
 * The extension-host runner (`test/runTest.ts`) explicitly ignores
 * `suite/webview/**`, so these DOM tests never run inside Electron and never
 * affect the extension-host suite.
 */

import * as path from "path";
import * as Mocha from "mocha";
import { glob } from "glob";
import { registerDomEnvironment } from "./suite/webview/harness/domEnvironment";
import { installVsCodeApiMock } from "./suite/webview/harness/vscodeApiMock";

async function main(): Promise<void> {
  // Register the DOM + VS Code bridge before Mocha requires any test file.
  registerDomEnvironment();
  installVsCodeApiMock();

  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 10000,
    reporter: "spec",
  });

  const testsRoot = path.resolve(__dirname);
  const files = await glob("suite/webview/**/*.test.js", { cwd: testsRoot });

  files.sort().forEach((file) => mocha.addFile(path.resolve(testsRoot, file)));

  console.log(`Running ${files.length} webview DOM test file(s)\n`);

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
