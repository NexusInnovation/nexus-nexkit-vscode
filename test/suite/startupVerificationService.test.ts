/**
 * Tests for StartupVerificationService
 * Verifies that essential Nexkit checks run at every VS Code startup:
 * - .git/info/exclude contains .nexkit/ exclusion
 * - nexkit.* files are migrated from .github to .nexkit
 * - GitHub authentication is verified
 *
 * settings.json writes are intentionally NOT part of startup verification.
 * They only occur from workspaceInitializationService and workspaceToUserMigrationService.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { StartupVerificationService } from "../../src/features/initialization/startupVerificationService";
import { GitExcludeConfigDeployer } from "../../src/features/initialization/gitExcludeConfigDeployer";
import { NexkitFileMigrationService } from "../../src/features/initialization/nexkitFileMigrationService";
import { HooksConfigDeployer } from "../../src/features/initialization/hooksConfigDeployer";
import { GitHubAuthPromptService } from "../../src/features/initialization/githubAuthPromptService";
import { UserDirectoryService } from "../../src/features/ai-template-files/services/userDirectoryService";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: StartupVerificationService", () => {
  let service: StartupVerificationService;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;

  let gitExcludeDeployer: GitExcludeConfigDeployer;
  let migrationService: NexkitFileMigrationService;
  let hooksConfigDeployer: HooksConfigDeployer;
  let authPromptService: GitHubAuthPromptService;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-startup-test-"));
    fs.mkdirSync(path.join(tempDir, ".git", "info"), { recursive: true });

    gitExcludeDeployer = new GitExcludeConfigDeployer();
    const mockUserDirectory = sandbox.createStubInstance(UserDirectoryService);
    mockUserDirectory.getAbsoluteTemplateLocations.returns({
      agents: "/tmp/.nexkit/agents",
      prompts: "/tmp/.nexkit/prompts",
      skills: "/tmp/.nexkit/skills",
      instructions: "/tmp/.nexkit/instructions",
      hooks: "/tmp/.nexkit/hooks",
      chatmodes: "/tmp/.nexkit/chatmodes",
    });
    hooksConfigDeployer = new HooksConfigDeployer(mockUserDirectory as any);
    migrationService = new NexkitFileMigrationService();
    authPromptService = new GitHubAuthPromptService();

    // Default to workspace mode for existing tests
    sandbox.stub(SettingsManager, "isUserDeployMode").returns(false);

    service = new StartupVerificationService(
      gitExcludeDeployer,
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

  test("verifyWorkspaceConfiguration should write .nexkit/ to .git/info/exclude in workspace mode", async () => {
    await service.verifyWorkspaceConfiguration(tempDir);

    const excludePath = path.join(tempDir, ".git", "info", "exclude");
    assert.ok(fs.existsSync(excludePath));
    const content = fs.readFileSync(excludePath, "utf8");
    assert.ok(content.includes(".nexkit/"));
  });

  test("verifyWorkspaceConfiguration should clean up legacy NexKit section from .gitignore", async () => {
    const gitignorePath = path.join(tempDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules/\n\n# BEGIN NexKit\n.nexkit/\n# END NexKit\n");

    await service.verifyWorkspaceConfiguration(tempDir);

    const content = fs.readFileSync(gitignorePath, "utf8");
    assert.ok(!content.includes("# BEGIN NexKit"), "Legacy NexKit section should be removed from .gitignore");
    assert.ok(content.includes("node_modules/"), "Unrelated .gitignore entries should be preserved");
  });

  test("verifyWorkspaceConfiguration should skip git exclude in user mode", async () => {
    (SettingsManager.isUserDeployMode as sinon.SinonStub).returns(true);

    await service.verifyWorkspaceConfiguration(tempDir);

    const excludePath = path.join(tempDir, ".git", "info", "exclude");
    const excludeExists = fs.existsSync(excludePath);
    if (excludeExists) {
      const content = fs.readFileSync(excludePath, "utf8");
      assert.ok(!content.includes(".nexkit/"), "Should not write .nexkit/ to .git/info/exclude in user mode");
    }
  });

  test("verifyWorkspaceConfiguration should NOT write to settings.json (no settings writes on activation)", async () => {
    const updateStub = sandbox.stub().resolves();
    sandbox.stub(vscode.workspace, "getConfiguration").returns({
      inspect: sandbox.stub().returns({ globalValue: undefined }),
      update: updateStub,
      get: sandbox.stub(),
      has: sandbox.stub(),
    } as any);

    await service.verifyWorkspaceConfiguration(tempDir);

    // No .vscode/settings.json should be created
    const settingsPath = path.join(tempDir, ".vscode", "settings.json");
    assert.ok(!fs.existsSync(settingsPath), "Should not create .vscode/settings.json during startup verification");

    // No VS Code configuration updates (no deployVscodeSettings call)
    assert.strictEqual(updateStub.callCount, 0, "Should not write any settings via VS Code API during startup verification");
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

  test("verifyWorkspaceConfiguration should be idempotent (no settings.json writes)", async () => {
    // Run twice — second run should not break anything
    await service.verifyWorkspaceConfiguration(tempDir);
    await service.verifyWorkspaceConfiguration(tempDir);

    const excludePath = path.join(tempDir, ".git", "info", "exclude");
    const content = fs.readFileSync(excludePath, "utf8");
    // Should have exactly one entry, not duplicated
    const matches = content.match(/\.nexkit\//g);
    assert.strictEqual(matches?.length, 1);

    // No .vscode/settings.json should exist — settings are never written at startup
    const settingsPath = path.join(tempDir, ".vscode", "settings.json");
    assert.ok(!fs.existsSync(settingsPath), "Should never create .vscode/settings.json during startup verification");
  });

  test("verifyOnStartup should skip if no workspace folder", async () => {
    sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);

    // Should not throw
    await service.verifyOnStartup();
  });
});
