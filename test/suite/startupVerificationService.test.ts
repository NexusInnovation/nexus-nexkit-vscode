/**
 * Tests for StartupVerificationService
 * Verifies that essential Nexkit checks run at every VS Code startup and keep user-level settings in sync:
 * - .git/info/exclude contains .nexkit/ exclusion
 * - startup verification is read-only for settings.json (no user- or workspace-level writes)
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
import { HooksConfigDeployer } from "../../src/features/initialization/hooksConfigDeployer";
import { GitHubAuthPromptService } from "../../src/features/initialization/githubAuthPromptService";

suite("Unit: StartupVerificationService", () => {
  let service: StartupVerificationService;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;

  let gitExcludeDeployer: GitExcludeConfigDeployer;
  let hooksConfigDeployer: HooksConfigDeployer;
  let authPromptService: GitHubAuthPromptService;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-startup-test-"));
    fs.mkdirSync(path.join(tempDir, ".git", "info"), { recursive: true });

    gitExcludeDeployer = new GitExcludeConfigDeployer();
    hooksConfigDeployer = new HooksConfigDeployer();
    authPromptService = new GitHubAuthPromptService();

    service = new StartupVerificationService(gitExcludeDeployer, hooksConfigDeployer, authPromptService);
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

  test("verifyWorkspaceConfiguration should write .nexkit/ to .git/info/exclude", async () => {
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

  test("verifyWorkspaceConfiguration should not write any settings (read-only for settings.json)", async () => {
    // Mock vscode.workspace.getConfiguration to detect any settings write attempts
    const updateStub = sandbox.stub().resolves();
    const inspectStub = sandbox.stub().returns({ globalValue: undefined });
    const fakeConfig = {
      inspect: inspectStub,
      update: updateStub,
      get: sandbox.stub(),
      has: sandbox.stub(),
    };
    sandbox.stub(vscode.workspace, "getConfiguration").returns(fakeConfig as any);

    await service.verifyWorkspaceConfiguration(tempDir);

    // Startup verification must never create workspace settings.json
    const settingsPath = path.join(tempDir, ".vscode", "settings.json");
    assert.ok(!fs.existsSync(settingsPath), "Should not create .vscode/settings.json");

    // Startup verification must never write user- or workspace-level settings
    assert.strictEqual(updateStub.callCount, 0, "Startup verification must not write any settings");
  });

  test("verifyWorkspaceConfiguration should be idempotent", async () => {
    // Run twice — second run should not break anything
    await service.verifyWorkspaceConfiguration(tempDir);
    await service.verifyWorkspaceConfiguration(tempDir);

    const excludePath = path.join(tempDir, ".git", "info", "exclude");
    const content = fs.readFileSync(excludePath, "utf8");
    // Should have exactly one entry, not duplicated
    const matches = content.match(/\.nexkit\//g);
    assert.strictEqual(matches?.length, 1);
  });

  test("verifyOnStartup should skip if no workspace folder", async () => {
    sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);

    // Should not throw
    await service.verifyOnStartup();
  });

  test("verifyOnStartup should not write any settings", async () => {
    const updateStub = sandbox.stub().resolves();
    const inspectStub = sandbox.stub().returns({ globalValue: undefined });
    const fakeConfig = {
      inspect: inspectStub,
      update: updateStub,
      get: sandbox.stub(),
      has: sandbox.stub(),
    };
    sandbox.stub(vscode.workspace, "getConfiguration").returns(fakeConfig as any);
    sandbox.stub(authPromptService, "ensureAuthenticated").resolves();
    sandbox.stub(vscode.workspace, "workspaceFile").value(undefined);
    sandbox.stub(vscode.workspace, "workspaceFolders").value([
      {
        uri: vscode.Uri.file(tempDir),
        name: path.basename(tempDir),
        index: 0,
      } as vscode.WorkspaceFolder,
    ]);

    await service.verifyOnStartup();

    assert.strictEqual(updateStub.callCount, 0, "Startup verification must not write any settings");
    const settingsPath = path.join(tempDir, ".vscode", "settings.json");
    assert.ok(!fs.existsSync(settingsPath), "Should not create .vscode/settings.json on activation");
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
