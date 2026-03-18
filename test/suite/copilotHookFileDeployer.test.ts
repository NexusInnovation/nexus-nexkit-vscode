/**
 * Tests for CopilotHookFileDeployer
 * Deploys a Copilot agent hook that runs tests after code modifications.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sinon from "sinon";
import { CopilotHookFileDeployer } from "../../src/features/initialization/copilotHookFileDeployer";
import { ProjectTypeDetectorService } from "../../src/features/initialization/projectTypeDetectorService";
import { TestCommandResolverService } from "../../src/features/initialization/testCommandResolverService";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: CopilotHookFileDeployer", () => {
  let deployer: CopilotHookFileDeployer;
  let projectTypeDetector: ProjectTypeDetectorService;
  let testCommandResolver: TestCommandResolverService;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-hook-deploy-"));

    projectTypeDetector = new ProjectTypeDetectorService();
    testCommandResolver = new TestCommandResolverService();
    deployer = new CopilotHookFileDeployer(projectTypeDetector, testCommandResolver);

    // Default: hook is enabled
    sandbox.stub(SettingsManager, "isCopilotAutoTestHookEnabled").returns(true);
  });

  teardown(() => {
    sandbox.restore();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("Should instantiate CopilotHookFileDeployer", () => {
    assert.ok(deployer);
  });

  test("Should deploy hook file for Node.js project", async () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");

    await deployer.deployCopilotTestHook(tempDir);

    const hookPath = path.join(tempDir, ".nexkit", "hooks", "nexkit-auto-test.json");
    assert.ok(fs.existsSync(hookPath), "Hook file should be created");

    const hookConfig = JSON.parse(fs.readFileSync(hookPath, "utf8"));
    assert.strictEqual(hookConfig.version, 1);
    assert.ok(hookConfig.hooks.agentStop);
    assert.strictEqual(hookConfig.hooks.agentStop[0].bash, "npm test");
    assert.strictEqual(hookConfig.hooks.agentStop[0].powershell, "npm test");
    assert.strictEqual(hookConfig.hooks.agentStop[0].cwd, ".");
    assert.strictEqual(hookConfig.hooks.agentStop[0].type, "command");
  });

  test("Should deploy hook file for .NET project", async () => {
    fs.writeFileSync(path.join(tempDir, "MyProject.csproj"), "<Project />");

    await deployer.deployCopilotTestHook(tempDir);

    const hookPath = path.join(tempDir, ".nexkit", "hooks", "nexkit-auto-test.json");
    const hookConfig = JSON.parse(fs.readFileSync(hookPath, "utf8"));
    assert.strictEqual(hookConfig.hooks.agentStop[0].bash, "dotnet test");
  });

  test("Should deploy hook file for Python project", async () => {
    fs.writeFileSync(path.join(tempDir, "requirements.txt"), "flask==2.0");

    await deployer.deployCopilotTestHook(tempDir);

    const hookPath = path.join(tempDir, ".nexkit", "hooks", "nexkit-auto-test.json");
    const hookConfig = JSON.parse(fs.readFileSync(hookPath, "utf8"));
    assert.strictEqual(hookConfig.hooks.agentStop[0].bash, "pytest");
  });

  test("Should skip deployment when setting is disabled", async () => {
    (SettingsManager.isCopilotAutoTestHookEnabled as sinon.SinonStub).returns(false);

    await deployer.deployCopilotTestHook(tempDir);

    const hookPath = path.join(tempDir, ".nexkit", "hooks", "nexkit-auto-test.json");
    assert.ok(!fs.existsSync(hookPath), "Hook file should NOT be created when disabled");
  });

  test("Should be idempotent — re-running does not break", async () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");

    await deployer.deployCopilotTestHook(tempDir);
    await deployer.deployCopilotTestHook(tempDir);

    const hookPath = path.join(tempDir, ".nexkit", "hooks", "nexkit-auto-test.json");
    const hookConfig = JSON.parse(fs.readFileSync(hookPath, "utf8"));
    assert.strictEqual(hookConfig.version, 1);
    assert.strictEqual(hookConfig.hooks.agentStop.length, 1);
  });

  test("verifyHookExists should return true when hook is deployed", async () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");
    await deployer.deployCopilotTestHook(tempDir);

    const exists = await deployer.verifyHookExists(tempDir);
    assert.strictEqual(exists, true);
  });

  test("verifyHookExists should return false when hook is not deployed", async () => {
    const exists = await deployer.verifyHookExists(tempDir);
    assert.strictEqual(exists, false);
  });

  test("Should create .nexkit/hooks directory if it does not exist", async () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");

    await deployer.deployCopilotTestHook(tempDir);

    const hooksDir = path.join(tempDir, ".nexkit", "hooks");
    assert.ok(fs.existsSync(hooksDir), ".nexkit/hooks directory should be created");
  });

  test("Should produce valid JSON hook file", async () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");

    await deployer.deployCopilotTestHook(tempDir);

    const hookPath = path.join(tempDir, ".nexkit", "hooks", "nexkit-auto-test.json");
    const content = fs.readFileSync(hookPath, "utf8");

    // Should not throw
    const parsed = JSON.parse(content);
    assert.strictEqual(typeof parsed.version, "number");
    assert.strictEqual(typeof parsed.hooks, "object");
  });
});
