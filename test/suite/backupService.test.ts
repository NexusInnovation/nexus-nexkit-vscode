/**
 * Tests for GitHubTemplateBackupService
 * Handles backup and restore operations for GitHub template folders only
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { GitHubTemplateBackupService } from "../../src/features/backup-management/backupService";

suite("Unit: GitHubTemplateBackupService", () => {
  let service: GitHubTemplateBackupService;
  let tempDir: string;

  setup(async () => {
    service = new GitHubTemplateBackupService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-backup-test-"));
  });

  teardown(async () => {
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

  test("Should backup only template folders from .nexkit directory", async () => {
    // Create .nexkit directory with template folders and other content
    const nexkitDir = path.join(tempDir, ".nexkit");
    fs.mkdirSync(nexkitDir, { recursive: true });

    // Create template folders
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "prompts"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "skills"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "instructions"), { recursive: true });
    fs.mkdirSync(path.join(nexkitDir, "chatmodes"), { recursive: true });

    // Add some content to template folders
    fs.writeFileSync(path.join(nexkitDir, "agents", "test.agent.md"), "agent content");
    fs.writeFileSync(path.join(nexkitDir, "prompts", "test.prompt.md"), "prompt content");
    fs.writeFileSync(path.join(nexkitDir, "skills", "test.skill.md"), "skill content");
    // Create non-template content that should NOT be backed up
    fs.mkdirSync(path.join(nexkitDir, "custom"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "custom", "extra.md"), "extra content");
    fs.writeFileSync(path.join(nexkitDir, "README.md"), "readme content");

    const backupPath = await service.backupTemplates(tempDir);

    // Verify backup was created
    assert.ok(backupPath);
    assert.ok(fs.existsSync(backupPath as string));
    assert.ok((backupPath as string).includes(".nexkit.backup-"));

    // Verify template folders were backed up
    assert.ok(fs.existsSync(path.join(backupPath as string, "agents", "test.agent.md")));
    assert.ok(fs.existsSync(path.join(backupPath as string, "prompts", "test.prompt.md")));

    // Verify non-template content was NOT backed up
    assert.ok(!fs.existsSync(path.join(backupPath as string, "custom")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "README.md")));

    // Verify original template folders were deleted
    assert.ok(!fs.existsSync(path.join(nexkitDir, "agents")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "prompts")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "skills")));

    // Verify non-template content still exists
    assert.ok(fs.existsSync(path.join(nexkitDir, "custom", "extra.md")));
    assert.ok(fs.existsSync(path.join(nexkitDir, "README.md")));
  });

  test("Should delete only template folders, preserving other .nexkit content", async () => {
    const nexkitDir = path.join(tempDir, ".nexkit");
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

    await service.deleteTemplateFolders(tempDir);

    // Verify template folders were deleted
    assert.ok(!fs.existsSync(path.join(nexkitDir, "agents")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "prompts")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "skills")));

    // Verify non-template content still exists
    assert.ok(fs.existsSync(path.join(nexkitDir, "custom", "extra.md")));
    assert.ok(fs.existsSync(path.join(nexkitDir, "README.md")));
  });

  test("Should list backups in workspace root", async () => {
    // Create some test backup directories
    fs.mkdirSync(path.join(tempDir, ".nexkit.backup-2024-01-01T12-00-00"));
    fs.mkdirSync(path.join(tempDir, ".nexkit.backup-2024-01-02T12-00-00"));

    const backups = await service.listBackups(tempDir);

    assert.ok(Array.isArray(backups));
    assert.strictEqual(backups.length, 2);
    assert.ok(backups[0].startsWith(".nexkit.backup-"));
    // Should be sorted newest first
    assert.ok(backups[0] > backups[1]);
  });

  test("Should restore template folders from backup", async () => {
    const nexkitDir = path.join(tempDir, ".nexkit");

    // Create a backup directory
    const backupDir = path.join(tempDir, ".nexkit.backup-2024-01-01T12-00-00");
    fs.mkdirSync(path.join(backupDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(backupDir, "agents", "restored.agent.md"), "restored content");

    // Create current state with different content
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "current.agent.md"), "current content");

    // Create non-template content that should be preserved
    fs.mkdirSync(path.join(nexkitDir, "custom"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "custom", "extra.md"), "extra");

    await service.restoreBackup(tempDir, ".nexkit.backup-2024-01-01T12-00-00");

    // Verify backup was restored
    assert.ok(fs.existsSync(path.join(nexkitDir, "agents", "restored.agent.md")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "agents", "current.agent.md")));

    // Verify non-template content was preserved
    assert.ok(fs.existsSync(path.join(nexkitDir, "custom", "extra.md")));
  });

  test("Should return null when backing up non-existent .nexkit directory", async () => {
    const result = await service.backupTemplates(tempDir);
    assert.strictEqual(result, null);
  });

  test("Should return null when backing up .nexkit with no template folders", async () => {
    const nexkitDir = path.join(tempDir, ".nexkit");
    fs.mkdirSync(nexkitDir, { recursive: true });

    // Only create non-template content
    fs.mkdirSync(path.join(nexkitDir, "custom"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "README.md"), "content");

    const result = await service.backupTemplates(tempDir);
    assert.strictEqual(result, null);
  });

  test("Should handle partial template folders", async () => {
    const nexkitDir = path.join(tempDir, ".nexkit");

    // Only create some template folders
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "test.agent.md"), "content");
    // Don't create prompts, skills, instructions, chatmodes

    const backupPath = await service.backupTemplates(tempDir);

    assert.ok(backupPath);
    assert.ok(fs.existsSync(path.join(backupPath as string, "agents")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "prompts")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "skills")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "instructions")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "chatmodes")));
  });

  test("Should cleanup old backups based on retention policy", async () => {
    // Create backup directories with different ages
    const oldBackup = path.join(tempDir, ".nexkit.backup-2020-01-01T12-00-00");
    const recentBackup = path.join(tempDir, ".nexkit.backup-2026-01-01T12-00-00");

    fs.mkdirSync(oldBackup);
    fs.mkdirSync(recentBackup);

    // Set old backup's mtime to be very old
    const oldDate = new Date("2020-01-01");
    fs.utimesSync(oldBackup, oldDate, oldDate);

    await service.cleanupBackups(tempDir, 30); // Keep backups for 30 days

    // Verify old backup was deleted
    assert.ok(!fs.existsSync(oldBackup));

    // Verify recent backup still exists
    assert.ok(fs.existsSync(recentBackup));
  });

  test("Should throw error when restoring non-existent backup", async () => {
    await assert.rejects(
      async () => {
        await service.restoreBackup(tempDir, ".nexkit.backup-nonexistent");
      },
      {
        message: /Backup .* not found/,
      }
    );
  });
});
