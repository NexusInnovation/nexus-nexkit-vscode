/**
 * Tests for StartupVerificationService
 * Verifies that essential Nexkit checks run at every VS Code startup:
 * - .git/info/exclude contains .nexkit/ exclusion (invisible to repo)
 * - VS Code settings contain all required chat file locations
 * - nexkit.* files are migrated from .github to .nexkit
 * - GitHub authentication is verified
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { StartupVerificationService } from "../../src/features/initialization/startupVerificationService";
import { GitExcludeConfigDeployer } from "../../src/features/initialization/gitExcludeConfigDeployer";
import { RecommendedSettingsConfigDeployer } from "../../src/features/initialization/recommendedSettingsConfigDeployer";
import { NexkitFileMigrationService } from "../../src/features/initialization/nexkitFileMigrationService";
import { HooksConfigDeployer } from "../../src/features/initialization/hooksConfigDeployer";
import { GitHubAuthPromptService } from "../../src/features/initialization/githubAuthPromptService";

suite("Unit: StartupVerificationService", () => {
  let service: StartupVerificationService;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;

  let gitExcludeDeployer: GitExcludeConfigDeployer;
  let settingsDeployer: RecommendedSettingsConfigDeployer;
  let migrationService: NexkitFileMigrationService;
  let hooksConfigDeployer: HooksConfigDeployer;
  let authPromptService: GitHubAuthPromptService;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-startup-test-"));

    // Create a fake .git directory so GitExcludeConfigDeployer can resolve the exclude path
    fs.mkdirSync(path.join(tempDir, ".git", "info"), { recursive: true });

    gitExcludeDeployer = new GitExcludeConfigDeployer();
    settingsDeployer = new RecommendedSettingsConfigDeployer();
    hooksConfigDeployer = new HooksConfigDeployer();
    migrationService = new NexkitFileMigrationService();
    authPromptService = new GitHubAuthPromptService();

    service = new StartupVerificationService(
      gitExcludeDeployer,
      settingsDeployer,
      hooksConfigDeployer,
      migrationService,
      authPromptService
    );
  });

  teardown(() => {
    sandbox.restore();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should instantiate StartupVerificationService", () => {
    assert.ok(service);
  });

  test("verifyWorkspaceConfiguration should add .nexkit/ to .git/info/exclude", async () => {
    await service.verifyWorkspaceConfiguration(tempDir);

    const excludePath = path.join(tempDir, ".git", "info", "exclude");
    assert.ok(fs.existsSync(excludePath));
    const content = fs.readFileSync(excludePath, "utf8");
    assert.ok(content.includes(".nexkit/"));
  });

  test("verifyWorkspaceConfiguration should not modify .gitignore", async () => {
    await service.verifyWorkspaceConfiguration(tempDir);

    const gitignorePath = path.join(tempDir, ".gitignore");
    assert.ok(!fs.existsSync(gitignorePath));
  });

  test("verifyWorkspaceConfiguration should remove legacy NexKit section from .gitignore", async () => {
    const gitignorePath = path.join(tempDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules/\n\n# BEGIN NexKit\n.nexkit/\n# END NexKit\n", "utf8");

    await service.verifyWorkspaceConfiguration(tempDir);

    const content = fs.readFileSync(gitignorePath, "utf8");
    assert.ok(!content.includes("# BEGIN NexKit"));
    assert.ok(!content.includes("# END NexKit"));
    assert.ok(content.includes("node_modules/"));
  });

  test("verifyWorkspaceConfiguration should deploy settings", async () => {
    await service.verifyWorkspaceConfiguration(tempDir);

    const settingsPath = path.join(tempDir, ".vscode", "settings.json");
    assert.ok(fs.existsSync(settingsPath));
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.deepStrictEqual(settings["chat.agentFilesLocations"], { ".nexkit/agents": true });
    assert.deepStrictEqual(settings["chat.hookFilesLocations"], { ".nexkit/hooks": true });
    assert.deepStrictEqual(settings["chat.promptFilesLocations"], { ".nexkit/prompts": true });
    assert.strictEqual(settings["chat.useHooks"], true);
  });

  test("verifyWorkspaceConfiguration should migrate nexkit files", async () => {
    // Create a nexkit.* file in .github/agents
    const agentsDir = path.join(tempDir, ".github", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "nexkit.test-agent.md"), "agent content");

    await service.verifyWorkspaceConfiguration(tempDir);

    // File should be migrated to .nexkit/agents
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "agents", "nexkit.test-agent.md")));
    assert.ok(!fs.existsSync(path.join(agentsDir, "nexkit.test-agent.md")));
  });

  test("verifyWorkspaceConfiguration should be idempotent", async () => {
    // Run twice — second run should not break anything
    await service.verifyWorkspaceConfiguration(tempDir);
    await service.verifyWorkspaceConfiguration(tempDir);

    const excludePath = path.join(tempDir, ".git", "info", "exclude");
    const content = fs.readFileSync(excludePath, "utf8");
    // Should have exactly one .nexkit/ entry, not duplicated
    const matches = content.match(/\.nexkit\//g);
    assert.strictEqual(matches?.length, 1);

    const settingsPath = path.join(tempDir, ".vscode", "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.strictEqual(settings["chat.useHooks"], true);
  });

  test("verifyOnStartup should skip if no workspace folder", async () => {
    sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);

    // Should not throw
    await service.verifyOnStartup();
  });

  test("verifyWorkspaceConfiguration should gracefully handle missing .git directory", async () => {
    // Create a temp dir without .git
    const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-no-git-test-"));
    try {
      // Should not throw even without .git
      await service.verifyWorkspaceConfiguration(noGitDir);
    } finally {
      fs.rmSync(noGitDir, { recursive: true, force: true });
    }
  });
});
