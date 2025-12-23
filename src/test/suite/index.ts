/**
 * Test suite index for Mocha test runner
 * Configures test execution and reporting
 */

import * as path from "path";
import * as Mocha from "mocha";
import { glob } from "glob";

export function run(): Promise<void> {
  // Create the mocha test runner
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 10000,
    reporter: "spec",
  });

  const testsRoot = path.resolve(__dirname, "..");

  return new Promise((resolve, reject) => {
    // Find all test files
    // Only load tests from the suite folder. This avoids picking up stray compiled
    // test artifacts (e.g., out/test/*.test.js) that may remain after refactors.
    glob("suite/**/*.test.js", { cwd: testsRoot })
      .then((files) => {
        // Add files to the test suite
        files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

        try {
          // Run the mocha test
          mocha.run((failures) => {
            if (failures > 0) {
              reject(new Error(`${failures} tests failed.`));
            } else {
              resolve();
            }
          });
        } catch (err) {
          console.error(err);
          reject(err);
        }
      })
      .catch((err) => {
        console.error("Error finding test files:", err);
        reject(err);
      });
  });
}
