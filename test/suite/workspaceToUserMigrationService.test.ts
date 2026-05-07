/**
 * Tests for WorkspaceToUserMigrationService
 * Handles migration of workspace .nexkit/ templates to user directory
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sinon from "sinon";
import { WorkspaceToUserMigrationService } from "../../src/features/initialization/workspaceToUserMigrationService";
import { UserDirectoryService } from "../../src/features/ai-template-files/services/userDirectoryService";
import { GitHubTemplateBackupService } from "../../src/features/backup-management/backupService";

suite("Unit: WorkspaceToUserMigrationService", () => {
  let service: WorkspaceToUserMigrationService;
  let userDirService: UserDirectoryService;
  let backupService: GitHubTemplateBackupService;
  let tempDir: string;
  let userNexkitRoot: string;
  let sandbox: sinon.SinonSandbox;

  setup(async () => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-migration-test-"));
    userNexkitRoot = path.join(tempDir, "user-nexkit");
    fs.mkdirSync(userNexkitRoot, { recursive: true });

    userDirService = new UserDirectoryService();
    sandbox.stub(userDirService, "getUserNexkitRoot").returns(userNexkitRoot);
    sandbox.stub(userDirService, "ensureUserDirectoryStructure").resolves();
    sandbox.stub(userDirService, "getAbsoluteTemplateLocations").returns({
      agents: path.join(userNexkitRoot, "agents"),
      prompts: path.join(userNexkitRoot, "prompts"),
      instructions: path.join(userNexkitRoot, "instructions"),
      chatmodes: path.join(userNexkitRoot, "chatmodes"),
      skills: path.join(userNexkitRoot, "skills"),
      hooks: path.join(userNexkitRoot, "hooks"),
    });

    backupService = new GitHubTemplateBackupService(userDirService);
    sandbox.stub(backupService, "backupTemplates").resolves(null);

    service = new WorkspaceToUserMigrationService(userDirService, backupService);
  });

  teardown(async () => {
    sandbox.restore();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("Should instantiate service", () => {
    assert.ok(service);
  });

  test("detectWorkspaceInstallation returns false when no .nexkit exists", async () => {
    const workspaceRoot = path.join(tempDir, "empty-workspace");
    fs.mkdirSync(workspaceRoot, { recursive: true });

    const result = await service.detectWorkspaceInstallation(workspaceRoot);

    assert.strictEqual(result.hasWorkspaceNexkit, false);
    assert.deepStrictEqual(result.templateFiles, {});
  });

  test("detectWorkspaceInstallation returns false when .nexkit exists but has no templates", async () => {
    const workspaceRoot = path.join(tempDir, "empty-nexkit");
    fs.mkdirSync(path.join(workspaceRoot, ".nexkit"), { recursive: true });

    const result = await service.detectWorkspaceInstallation(workspaceRoot);

    assert.strictEqual(result.hasWorkspaceNexkit, false);
  });

  test("detectWorkspaceInstallation detects templates correctly", async () => {
    const workspaceRoot = path.join(tempDir, "with-templates");
    const nexkitDir = path.join(workspaceRoot, ".nexkit");
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "prompts"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "nexkit.test-agent.md"), "agent content");
    fs.writeFileSync(path.join(nexkitDir, "prompts", "nexkit.test-prompt.md"), "prompt content");

    const result = await service.detectWorkspaceInstallation(workspaceRoot);

    assert.strictEqual(result.hasWorkspaceNexkit, true);
    assert.deepStrictEqual(result.templateFiles["agents"], ["nexkit.test-agent.md"]);
    assert.deepStrictEqual(result.templateFiles["prompts"], ["nexkit.test-prompt.md"]);
  });

  test("detectWorkspaceInstallation identifies project-specific instructions", async () => {
    const workspaceRoot = path.join(tempDir, "with-instructions");
    const nexkitDir = path.join(workspaceRoot, ".nexkit");
    fs.mkdirSync(path.join(nexkitDir, "instructions"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "instructions", "nexkit.csharp.md"), "c# guidelines");
    fs.writeFileSync(path.join(nexkitDir, "instructions", "project-specific.md"), "local rules");

    const result = await service.detectWorkspaceInstallation(workspaceRoot);

    assert.strictEqual(result.hasWorkspaceNexkit, true);
    assert.strictEqual(result.hasProjectSpecificInstructions, true);
  });

  test("executeMigration copies files to user directory", async () => {
    const workspaceRoot = path.join(tempDir, "migration-source");
    const nexkitDir = path.join(workspaceRoot, ".nexkit");
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "prompts"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "test-agent.md"), "agent content");
    fs.writeFileSync(path.join(nexkitDir, "prompts", "test-prompt.md"), "prompt content");

    // Create target directories (simulating ensureUserDirectoryStructure)
    fs.mkdirSync(path.join(userNexkitRoot, "agents"), { recursive: true });
    fs.mkdirSync(path.join(userNexkitRoot, "prompts"), { recursive: true });

    const summary = await service.executeMigration(workspaceRoot, false);

    assert.strictEqual(summary.copiedCount, 2);
    assert.deepStrictEqual(summary.copiedFiles["agents"], ["test-agent.md"]);
    assert.deepStrictEqual(summary.copiedFiles["prompts"], ["test-prompt.md"]);
    assert.strictEqual(summary.workspaceDeleted, false);

    // Verify files were copied
    assert.ok(fs.existsSync(path.join(userNexkitRoot, "agents", "test-agent.md")));
    assert.ok(fs.existsSync(path.join(userNexkitRoot, "prompts", "test-prompt.md")));
  });

  test("executeMigration skips files that already exist in user directory", async () => {
    const workspaceRoot = path.join(tempDir, "migration-skip");
    const nexkitDir = path.join(workspaceRoot, ".nexkit");
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "existing.md"), "workspace version");

    // Pre-create file in user directory
    fs.mkdirSync(path.join(userNexkitRoot, "agents"), { recursive: true });
    fs.writeFileSync(path.join(userNexkitRoot, "agents", "existing.md"), "user version");

    const summary = await service.executeMigration(workspaceRoot, false);

    assert.strictEqual(summary.copiedCount, 0);
    assert.strictEqual(summary.skippedCount, 1);

    // Verify user version was NOT overwritten
    const content = fs.readFileSync(path.join(userNexkitRoot, "agents", "existing.md"), "utf8");
    assert.strictEqual(content, "user version");
  });

  test("executeMigration deletes workspace .nexkit when requested", async () => {
    const workspaceRoot = path.join(tempDir, "migration-delete");
    const nexkitDir = path.join(workspaceRoot, ".nexkit");
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "file.md"), "content");

    fs.mkdirSync(path.join(userNexkitRoot, "agents"), { recursive: true });

    const summary = await service.executeMigration(workspaceRoot, true);

    assert.strictEqual(summary.workspaceDeleted, true);
    assert.ok(!fs.existsSync(nexkitDir));
  });

  test("executeMigration removes NexKit section from .gitignore", async () => {
    const workspaceRoot = path.join(tempDir, "migration-gitignore");
    const nexkitDir = path.join(workspaceRoot, ".nexkit");
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "file.md"), "content");

    // Create .gitignore with NexKit section
    const gitignoreContent = `node_modules/\n\n# BEGIN NexKit\n.nexkit/\n# END NexKit\n\ndist/\n`;
    fs.writeFileSync(path.join(workspaceRoot, ".gitignore"), gitignoreContent);

    fs.mkdirSync(path.join(userNexkitRoot, "agents"), { recursive: true });

    const summary = await service.executeMigration(workspaceRoot, false);

    assert.strictEqual(summary.gitignoreCleaned, true);

    const updatedGitignore = fs.readFileSync(path.join(workspaceRoot, ".gitignore"), "utf8");
    assert.ok(!updatedGitignore.includes("BEGIN NexKit"));
    assert.ok(!updatedGitignore.includes(".nexkit/"));
    assert.ok(updatedGitignore.includes("node_modules/"));
    assert.ok(updatedGitignore.includes("dist/"));
  });

  test("executeMigration cleans workspace settings", async () => {
    const workspaceRoot = path.join(tempDir, "migration-settings");
    const nexkitDir = path.join(workspaceRoot, ".nexkit");
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "file.md"), "content");

    // Create .vscode/settings.json with NexKit entries
    const vscodeDir = path.join(workspaceRoot, ".vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });
    const settings = {
      "editor.fontSize": 14,
      "chat.agentFilesLocations": { ".nexkit/agents": true, "/other/path": true },
      "chat.useHooks": true,
    };
    fs.writeFileSync(path.join(vscodeDir, "settings.json"), JSON.stringify(settings, null, 2));

    fs.mkdirSync(path.join(userNexkitRoot, "agents"), { recursive: true });

    const summary = await service.executeMigration(workspaceRoot, false);

    assert.strictEqual(summary.settingsCleaned, true);

    const updatedSettings = JSON.parse(fs.readFileSync(path.join(vscodeDir, "settings.json"), "utf8"));
    assert.strictEqual(updatedSettings["editor.fontSize"], 14);
    assert.ok(!updatedSettings["chat.useHooks"]);
    // .nexkit entry removed, /other/path preserved
    assert.deepStrictEqual(updatedSettings["chat.agentFilesLocations"], { "/other/path": true });
  });

  test("executeMigration calls backup before migration", async () => {
    const workspaceRoot = path.join(tempDir, "migration-backup");
    const nexkitDir = path.join(workspaceRoot, ".nexkit");
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "file.md"), "content");
    fs.mkdirSync(path.join(userNexkitRoot, "agents"), { recursive: true });

    await service.executeMigration(workspaceRoot, false);

    assert.ok((backupService.backupTemplates as sinon.SinonStub).calledOnce);
    assert.ok((backupService.backupTemplates as sinon.SinonStub).calledWith(workspaceRoot));
  });
});
