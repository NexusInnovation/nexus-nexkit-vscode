/*
  Regression checks for Phase 3 findings.
  These tests are intentionally expectation-driven against desired behavior.
  On current baseline they are expected to fail for confirmed open bugs.
*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const cases = [
  {
    id: "BUG-001",
    description: "Startup verification should not call interactive auth prompt path unconditionally",
    run: () => {
      const startup = read("src/features/initialization/startupVerificationService.ts");
      if (startup.includes("await this._githubAuthPrompt.ensureAuthenticated();")) {
        throw new Error("Found unconditional startup ensureAuthenticated() call");
      }
    },
  },
  {
    id: "BUG-002",
    description: "MCP config parse errors should not continue to destructive write path",
    run: () => {
      const mcp = read("src/features/mcp-management/mcpConfigService.ts");
      const hasParseCatchFallback = /JSON\.parse\(content\)[\s\S]*catch\s*\{[\s\S]*start fresh/i.test(mcp);
      const hasWriteBack = mcp.includes("await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), \"utf8\")");
      if (hasParseCatchFallback && hasWriteBack) {
        throw new Error("Parse fallback plus unconditional write-back indicates overwrite risk");
      }
    },
  },
  {
    id: "BUG-003",
    description: "Watcher restore should not rely exclusively on UTF-8 string reads/writes",
    run: () => {
      const watcher = read("src/features/nexkit-file-watcher/nexkitFileWatcherService.ts");
      const hasUtf8Restore = watcher.includes('await fs.promises.writeFile(filePath, originalContent, "utf8")');
      if (hasUtf8Restore) {
        throw new Error("Found utf8 string restore path instead of byte-safe restore");
      }
    },
  },
  {
    id: "BUG-004",
    description: "Workflow command args should be escaped instead of direct interpolation",
    run: () => {
      const runner = read("src/features/github-workflow-runner/githubWorkflowRunnerService.ts");
      const pwshInterpolated = runner.includes('args.push(`-Event "${params.event}"`)');
      const shInterpolated = runner.includes('args.push(`--event "${params.event}"`)');
      if (pwshInterpolated || shInterpolated) {
        throw new Error("Found direct interpolation for event/job command args");
      }
    },
  },
  {
    id: "BUG-005",
    description: "Activation contract tests should not be skipped and should use live command IDs",
    run: () => {
      const extensionTest = read("test/suite/extension.test.ts");
      const packageJson = read("package.json");
      const hasSkippedActivation = extensionTest.includes('test.skip("Commands should be registered"');
      const expectsInitProject = extensionTest.includes('"nexus-nexkit-vscode.initProject"');
      const packageHasInitProject = packageJson.includes('"nexus-nexkit-vscode.initProject"');
      if (hasSkippedActivation || (expectsInitProject && !packageHasInitProject)) {
        throw new Error("Activation contract coverage is skipped and/or stale");
      }
    },
  },
  {
    id: "BUG-006",
    description: "Global process handlers should have explicit teardown or dedupe guard",
    run: () => {
      const extension = read("src/extension.ts");
      const hasHandlers = extension.includes('process.on("unhandledRejection"') && extension.includes('process.on("uncaughtException"');
      const hasEmptyDeactivate = /export function deactivate\(\) \{\}/.test(extension);
      if (hasHandlers && hasEmptyDeactivate) {
        throw new Error("Found global process handlers without teardown in deactivate()");
      }
    },
  },
];

let passed = 0;
let failed = 0;
const results = [];

for (const testCase of cases) {
  try {
    testCase.run();
    passed += 1;
    results.push({ id: testCase.id, status: "PASS", description: testCase.description });
    console.log(`[PASS] ${testCase.id} - ${testCase.description}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ id: testCase.id, status: "FAIL", description: testCase.description, message });
    console.log(`[FAIL] ${testCase.id} - ${message}`);
  }
}

const summary = {
  date: new Date().toISOString(),
  total: cases.length,
  passed,
  failed,
  expected_failed_open_bugs: failed,
  results,
};

const resultsDir = path.join(ROOT, "quality", "results");
fs.mkdirSync(resultsDir, { recursive: true });
fs.writeFileSync(path.join(resultsDir, "phase3-regression-results.json"), JSON.stringify(summary, null, 2), "utf8");

console.log(`\\nSummary: total=${summary.total}, passed=${summary.passed}, failed=${summary.failed}`);

if (failed > 0) {
  process.exitCode = 1;
}
