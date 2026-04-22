/**
 * Tests for HooksConfigDeployer
 * Verifies test framework detection and hook file deployment
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { HooksConfigDeployer } from "../../src/features/initialization/hooksConfigDeployer";

suite("Unit: HooksConfigDeployer", () => {
  let deployer: HooksConfigDeployer;
  let tempDir: string;

  setup(() => {
    deployer = new HooksConfigDeployer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-hooks-test-"));
  });

  teardown(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should detect Node.js test:headless script", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ scripts: { "test:headless": "mocha", "test:unit": "jest", test: "npm run test:unit" } }),
      "utf8"
    );

    await deployer.deployRunTestsHook(tempDir);

    const hookPath = path.join(tempDir, ".nexkit", "hooks", "run-tests.json");
    assert.ok(fs.existsSync(hookPath));
    const config = JSON.parse(fs.readFileSync(hookPath, "utf8"));
    assert.ok(config.hooks.Stop[0].command.includes("test:headless"));
    assert.ok(config.hooks.Stop[0].windows?.includes("test:headless"));
  });

  test("Should detect Node.js test:unit script when no test:headless", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ scripts: { "test:unit": "jest", test: "npm run test:unit" } }),
      "utf8"
    );

    await deployer.deployRunTestsHook(tempDir);

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".nexkit", "hooks", "run-tests.json"), "utf8"));
    assert.ok(config.hooks.Stop[0].command.includes("test:unit"));
    assert.ok(config.hooks.Stop[0].windows?.includes("test:unit"));
  });

  test("Should detect Node.js test script as fallback", async () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "jest" } }), "utf8");

    await deployer.deployRunTestsHook(tempDir);

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".nexkit", "hooks", "run-tests.json"), "utf8"));
    assert.strictEqual(config.hooks.Stop[0].command, "npm test");
  });

  test("Should detect .NET project via .csproj", async () => {
    fs.writeFileSync(path.join(tempDir, "MyApp.csproj"), "<Project></Project>", "utf8");

    await deployer.deployRunTestsHook(tempDir);

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".nexkit", "hooks", "run-tests.json"), "utf8"));
    assert.strictEqual(config.hooks.Stop[0].command, "dotnet test");
  });

  test("Should detect .NET project via .sln", async () => {
    fs.writeFileSync(path.join(tempDir, "MyApp.sln"), "", "utf8");

    await deployer.deployRunTestsHook(tempDir);

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".nexkit", "hooks", "run-tests.json"), "utf8"));
    assert.strictEqual(config.hooks.Stop[0].command, "dotnet test");
  });

  test("Should detect Python project via pyproject.toml", async () => {
    fs.writeFileSync(path.join(tempDir, "pyproject.toml"), "[tool.pytest]", "utf8");

    await deployer.deployRunTestsHook(tempDir);

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".nexkit", "hooks", "run-tests.json"), "utf8"));
    assert.strictEqual(config.hooks.Stop[0].command, "python -m pytest");
  });

  test("Should detect Go project via go.mod", async () => {
    fs.writeFileSync(path.join(tempDir, "go.mod"), "module example.com/app", "utf8");

    await deployer.deployRunTestsHook(tempDir);

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".nexkit", "hooks", "run-tests.json"), "utf8"));
    assert.strictEqual(config.hooks.Stop[0].command, "go test ./...");
  });

  test("Should skip deployment when no test framework detected", async () => {
    await deployer.deployRunTestsHook(tempDir);

    const hookPath = path.join(tempDir, ".nexkit", "hooks", "run-tests.json");
    assert.ok(!fs.existsSync(hookPath));
  });

  test("Should merge with existing hook configuration", async () => {
    const hooksDir = path.join(tempDir, ".nexkit", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });

    const existingConfig = {
      hooks: {
        PostToolUse: [{ type: "command", command: "npx prettier --write" }],
      },
    };
    fs.writeFileSync(path.join(hooksDir, "run-tests.json"), JSON.stringify(existingConfig), "utf8");

    fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "jest" } }), "utf8");

    await deployer.deployRunTestsHook(tempDir);

    const config = JSON.parse(fs.readFileSync(path.join(hooksDir, "run-tests.json"), "utf8"));
    // Existing hook should be preserved
    assert.ok(config.hooks.PostToolUse);
    // New Stop hook should be added
    assert.ok(config.hooks.Stop);
  });

  test("Should skip Node.js package.json with no test scripts", async () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }), "utf8");

    await deployer.deployRunTestsHook(tempDir);

    const hookPath = path.join(tempDir, ".nexkit", "hooks", "run-tests.json");
    assert.ok(!fs.existsSync(hookPath));
  });
});
