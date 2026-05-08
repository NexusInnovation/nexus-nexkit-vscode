/**
 * Tests for GitHubTemplateBackupService
 * Handles backup and restore operations for GitHub template folders only
 * Backups are stored in user directory (simulated via UserDirectoryService)
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { GitHubTemplateBackupService } from "../../src/features/backup-management/backupService";
import { UserDirectoryService } from "../../src/features/ai-template-files/services/userDirectoryService";
import * as sinon from "sinon";

suite("Unit: GitHubTemplateBackupService", () => {
  let service: GitHubTemplateBackupService;
  let userDirService: UserDirectoryService;
  let tempDir: string;
  let userBackupDir: string;
  let sandbox: sinon.SinonSandbox;

  setup(async () => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-backup-test-"));
    userBackupDir = path.join(tempDir, "user-backups");
    fs.mkdirSync(userBackupDir, { recursive: true });

    userDirService = new UserDirectoryService();
    sandbox.stub(userDirService, "getUserBackupDir").returns(userBackupDir);

    service = new GitHubTemplateBackupService(userDirService);
  });

  teardown(async () => {
    sandbox.restore();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should instantiate GitHubTemplateBackupService", () => {
    assert.ok(service);
  });

  test("Should have backup methods", () => {
    assert.strictEqual(typeof service.backupTemplates, "function");
    assert.strictEqual(typeof service.deleteTemplateFolders, "function");
    assert.strictEqual(typeof service.listBackups, "function");
    assert.strictEqual(typeof service.restoreBackup, "function");
    assert.strictEqual(typeof service.cleanupBackups, "function");
  });

  test("Should backup only template folders to user directory", async () => {
    // Create workspace with .nexkit directory containing template folders
    const workspaceDir = path.join(tempDir, "workspace");
    const nexkitDir = path.join(workspaceDir, ".nexkit");
    fs.mkdirSync(nexkitDir, { recursive: true });

    // Create template folders
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "prompts"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "skills"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "instructions"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "chatmodes"), { recursive: true });

    // Add content to template folders
    fs.writeFileSync(path.join(nexkitDir, "agents", "test.agent.md"), "agent content");
    fs.writeFileSync(path.join(nexkitDir, "prompts", "test.prompt.md"), "prompt content");
    fs.writeFileSync(path.join(nexkitDir, "skills", "test.skill.md"), "skill content");
    // Create non-template content that should NOT be backed up
    fs.mkdirSync(path.join(nexkitDir, "custom"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "custom", "extra.md"), "extra content");
    fs.writeFileSync(path.join(nexkitDir, "README.md"), "readme content");

    const backupPath = await service.backupTemplates(workspaceDir);

    // Verify backup was created in user directory (not workspace)
    assert.ok(backupPath);
    assert.ok((backupPath as string).startsWith(userBackupDir));

    // Verify template folders were backed up
    assert.ok(fs.existsSync(path.join(backupPath as string, "agents", "test.agent.md")));
    assert.ok(fs.existsSync(path.join(backupPath as string, "prompts", "test.prompt.md")));

    // Verify non-template content was NOT backed up
    assert.ok(!fs.existsSync(path.join(backupPath as string, "custom")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "README.md")));

    // Verify no .nexkit.backup-* directory created in workspace
    const workspaceEntries = fs.readdirSync(workspaceDir);
    const workspaceBackups = workspaceEntries.filter((e) => e.startsWith(".nexkit.backup-"));
    assert.strictEqual(workspaceBackups.length, 0);

    // Verify original template folders were deleted
    assert.ok(!fs.existsSync(path.join(nexkitDir, "agents")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "prompts")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "skills")));

    // Verify non-template content still exists
    assert.ok(fs.existsSync(path.join(nexkitDir, "custom", "extra.md")));
    assert.ok(fs.existsSync(path.join(nexkitDir, "README.md")));
  });

  test("Should delete only template folders, preserving other .nexkit content", async () => {
    const workspaceDir = path.join(tempDir, "workspace2");
    const nexkitDir = path.join(workspaceDir, ".nexkit");
    fs.mkdirSync(nexkitDir, { recursive: true });

    // Create template folders
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "prompts"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "skills"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "test.agent.md"), "content");

    // Create non-template content
    fs.mkdirSync(path.join(nexkitDir, "custom"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "custom", "extra.md"), "extra");
    fs.writeFileSync(path.join(nexkitDir, "README.md"), "readme");

    await service.deleteTemplateFolders(workspaceDir);

    // Verify template folders were deleted
    assert.ok(!fs.existsSync(path.join(nexkitDir, "agents")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "prompts")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "skills")));

    // Verify non-template content still exists
    assert.ok(fs.existsSync(path.join(nexkitDir, "custom", "extra.md")));
    assert.ok(fs.existsSync(path.join(nexkitDir, "README.md")));
  });

  test("Should list backups from user directory", async () => {
    // Create some test backup directories in user backup dir
    fs.mkdirSync(path.join(userBackupDir, "2024-01-01_12-00-00"));
    fs.mkdirSync(path.join(userBackupDir, "2024-01-02_12-00-00"));

    const backups = await service.listBackups();

    assert.ok(Array.isArray(backups));
    assert.strictEqual(backups.length, 2);
    // Should be sorted newest first
    assert.strictEqual(backups[0], "2024-01-02_12-00-00");
    assert.strictEqual(backups[1], "2024-01-01_12-00-00");
  });

  test("Should restore template folders from user directory backup", async () => {
    const workspaceDir = path.join(tempDir, "workspace3");
    const nexkitDir = path.join(workspaceDir, ".nexkit");

    // Create a backup directory in user backup dir
    const backupDir = path.join(userBackupDir, "2024-01-01_12-00-00");
    fs.mkdirSync(path.join(backupDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(backupDir, "agents", "restored.agent.md"), "restored content");

    // Create current state with different content
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "current.agent.md"), "current content");

    // Create non-template content that should be preserved
    fs.mkdirSync(path.join(nexkitDir, "custom"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "custom", "extra.md"), "extra");

    await service.restoreBackup(workspaceDir, "2024-01-01_12-00-00");

    // Verify backup was restored
    assert.ok(fs.existsSync(path.join(nexkitDir, "agents", "restored.agent.md")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "agents", "current.agent.md")));

    // Verify non-template content was preserved
    assert.ok(fs.existsSync(path.join(nexkitDir, "custom", "extra.md")));
  });

  test("Should return null when backing up non-existent .nexkit directory", async () => {
    const workspaceDir = path.join(tempDir, "empty-workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });
    const result = await service.backupTemplates(workspaceDir);
    assert.strictEqual(result, null);
  });

  test("Should return null when backing up .nexkit with no template folders", async () => {
    const workspaceDir = path.join(tempDir, "workspace4");
    const nexkitDir = path.join(workspaceDir, ".nexkit");
    fs.mkdirSync(nexkitDir, { recursive: true });

    // Only create non-template content
    fs.mkdirSync(path.join(nexkitDir, "custom"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "README.md"), "content");

    const result = await service.backupTemplates(workspaceDir);
    assert.strictEqual(result, null);
  });

  test("Should handle partial template folders", async () => {
    const workspaceDir = path.join(tempDir, "workspace5");
    const nexkitDir = path.join(workspaceDir, ".nexkit");

    // Only create some template folders
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "test.agent.md"), "content");

    const backupPath = await service.backupTemplates(workspaceDir);

    assert.ok(backupPath);
    assert.ok(fs.existsSync(path.join(backupPath as string, "agents")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "prompts")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "skills")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "instructions")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "chatmodes")));
  });

  test("Should cleanup old backups keeping only max specified", async () => {
    // Create 7 backup directories
    for (let i = 1; i <= 7; i++) {
      fs.mkdirSync(path.join(userBackupDir, `2024-01-0${i}_12-00-00`));
    }

    await service.cleanupBackups(5);

    const remaining = await service.listBackups();
    assert.strictEqual(remaining.length, 5);
    // Should keep the 5 most recent
    assert.strictEqual(remaining[0], "2024-01-07_12-00-00");
    assert.strictEqual(remaining[4], "2024-01-03_12-00-00");
    // Oldest two should be deleted
    assert.ok(!fs.existsSync(path.join(userBackupDir, "2024-01-01_12-00-00")));
    assert.ok(!fs.existsSync(path.join(userBackupDir, "2024-01-02_12-00-00")));
  });

  test("Should enforce retention policy automatically on backup", async () => {
    // Create 5 existing backups (at max capacity)
    for (let i = 1; i <= 5; i++) {
      fs.mkdirSync(path.join(userBackupDir, `2024-01-0${i}_12-00-00`));
    }

    // Create workspace with templates to trigger a new backup
    const workspaceDir = path.join(tempDir, "workspace6");
    const nexkitDir = path.join(workspaceDir, ".nexkit");
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "test.agent.md"), "content");

    await service.backupTemplates(workspaceDir);

    const remaining = await service.listBackups();
    // Should have 5 backups (oldest deleted, new one added)
    assert.strictEqual(remaining.length, 5);
    // The oldest backup (01) should be gone
    assert.ok(!fs.existsSync(path.join(userBackupDir, "2024-01-01_12-00-00")));
  });

  test("Should throw error when restoring non-existent backup", async () => {
    const workspaceDir = path.join(tempDir, "workspace7");
    fs.mkdirSync(workspaceDir, { recursive: true });

    await assert.rejects(
      async () => {
        await service.restoreBackup(workspaceDir, "nonexistent-backup");
      },
      {
        message: /Backup .* not found/,
      }
    );
  });

  test("Should delete all backups when cleanupBackups called with 0", async () => {
    fs.mkdirSync(path.join(userBackupDir, "2024-01-01_12-00-00"));
    fs.mkdirSync(path.join(userBackupDir, "2024-01-02_12-00-00"));

    await service.cleanupBackups(0);

    const remaining = await service.listBackups();
    assert.strictEqual(remaining.length, 0);
  });
});
