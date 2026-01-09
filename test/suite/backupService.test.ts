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

  test("Should backup only template folders from .github directory", async () => {
    // Create .github directory with template folders and other content
    const githubDir = path.join(tempDir, ".github");
    fs.mkdirSync(githubDir, { recursive: true });

    // Create template folders
    fs.mkdirSync(path.join(githubDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(githubDir, "prompts"), { recursive: true });
    fs.mkdirSync(path.join(githubDir, "instructions"), { recursive: true });
    fs.mkdirSync(path.join(githubDir, "chatmodes"), { recursive: true });

    // Add some content to template folders
    fs.writeFileSync(path.join(githubDir, "agents", "test.agent.md"), "agent content");
    fs.writeFileSync(path.join(githubDir, "prompts", "test.prompt.md"), "prompt content");

    // Create non-template content that should NOT be backed up
    fs.mkdirSync(path.join(githubDir, "workflows"), { recursive: true });
    fs.writeFileSync(path.join(githubDir, "workflows", "ci.yml"), "workflow content");
    fs.writeFileSync(path.join(githubDir, "CODEOWNERS"), "codeowners content");

    const backupPath = await service.backupTemplates(tempDir);

    // Verify backup was created
    assert.ok(backupPath);
    assert.ok(fs.existsSync(backupPath as string));
    assert.ok((backupPath as string).includes(".github.backup-"));

    // Verify template folders were backed up
    assert.ok(fs.existsSync(path.join(backupPath as string, "agents", "test.agent.md")));
    assert.ok(fs.existsSync(path.join(backupPath as string, "prompts", "test.prompt.md")));

    // Verify non-template content was NOT backed up
    assert.ok(!fs.existsSync(path.join(backupPath as string, "workflows")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "CODEOWNERS")));

    // Verify original template folders were deleted
    assert.ok(!fs.existsSync(path.join(githubDir, "agents")));
    assert.ok(!fs.existsSync(path.join(githubDir, "prompts")));

    // Verify non-template content still exists
    assert.ok(fs.existsSync(path.join(githubDir, "workflows", "ci.yml")));
    assert.ok(fs.existsSync(path.join(githubDir, "CODEOWNERS")));
  });

  test("Should delete only template folders, preserving other .github content", async () => {
    const githubDir = path.join(tempDir, ".github");
    fs.mkdirSync(githubDir, { recursive: true });

    // Create template folders
    fs.mkdirSync(path.join(githubDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(githubDir, "prompts"), { recursive: true });
    fs.writeFileSync(path.join(githubDir, "agents", "test.agent.md"), "content");

    // Create non-template content
    fs.mkdirSync(path.join(githubDir, "workflows"), { recursive: true });
    fs.writeFileSync(path.join(githubDir, "workflows", "ci.yml"), "workflow");
    fs.writeFileSync(path.join(githubDir, "CODEOWNERS"), "owners");

    await service.deleteTemplateFolders(tempDir);

    // Verify template folders were deleted
    assert.ok(!fs.existsSync(path.join(githubDir, "agents")));
    assert.ok(!fs.existsSync(path.join(githubDir, "prompts")));

    // Verify non-template content still exists
    assert.ok(fs.existsSync(path.join(githubDir, "workflows", "ci.yml")));
    assert.ok(fs.existsSync(path.join(githubDir, "CODEOWNERS")));
  });

  test("Should list backups in workspace root", async () => {
    // Create some test backup directories
    fs.mkdirSync(path.join(tempDir, ".github.backup-2024-01-01T12-00-00"));
    fs.mkdirSync(path.join(tempDir, ".github.backup-2024-01-02T12-00-00"));

    const backups = await service.listBackups(tempDir);

    assert.ok(Array.isArray(backups));
    assert.strictEqual(backups.length, 2);
    assert.ok(backups[0].startsWith(".github.backup-"));
    // Should be sorted newest first
    assert.ok(backups[0] > backups[1]);
  });

  test("Should restore template folders from backup", async () => {
    const githubDir = path.join(tempDir, ".github");

    // Create a backup directory
    const backupDir = path.join(tempDir, ".github.backup-2024-01-01T12-00-00");
    fs.mkdirSync(path.join(backupDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(backupDir, "agents", "restored.agent.md"), "restored content");

    // Create current state with different content
    fs.mkdirSync(path.join(githubDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(githubDir, "agents", "current.agent.md"), "current content");

    // Create non-template content that should be preserved
    fs.mkdirSync(path.join(githubDir, "workflows"), { recursive: true });
    fs.writeFileSync(path.join(githubDir, "workflows", "ci.yml"), "workflow");

    await service.restoreBackup(tempDir, ".github.backup-2024-01-01T12-00-00");

    // Verify backup was restored
    assert.ok(fs.existsSync(path.join(githubDir, "agents", "restored.agent.md")));
    assert.ok(!fs.existsSync(path.join(githubDir, "agents", "current.agent.md")));

    // Verify non-template content was preserved
    assert.ok(fs.existsSync(path.join(githubDir, "workflows", "ci.yml")));
  });

  test("Should return null when backing up non-existent .github directory", async () => {
    const result = await service.backupTemplates(tempDir);
    assert.strictEqual(result, null);
  });

  test("Should return null when backing up .github with no template folders", async () => {
    const githubDir = path.join(tempDir, ".github");
    fs.mkdirSync(githubDir, { recursive: true });

    // Only create non-template content
    fs.mkdirSync(path.join(githubDir, "workflows"), { recursive: true });
    fs.writeFileSync(path.join(githubDir, "CODEOWNERS"), "content");

    const result = await service.backupTemplates(tempDir);
    assert.strictEqual(result, null);
  });

  test("Should handle partial template folders", async () => {
    const githubDir = path.join(tempDir, ".github");

    // Only create some template folders
    fs.mkdirSync(path.join(githubDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(githubDir, "agents", "test.agent.md"), "content");
    // Don't create prompts, instructions, chatmodes

    const backupPath = await service.backupTemplates(tempDir);

    assert.ok(backupPath);
    assert.ok(fs.existsSync(path.join(backupPath as string, "agents")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "prompts")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "instructions")));
    assert.ok(!fs.existsSync(path.join(backupPath as string, "chatmodes")));
  });

  test("Should cleanup old backups based on retention policy", async () => {
    // Create backup directories with different ages
    const oldBackup = path.join(tempDir, ".github.backup-2020-01-01T12-00-00");
    const recentBackup = path.join(tempDir, ".github.backup-2026-01-01T12-00-00");

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
        await service.restoreBackup(tempDir, ".github.backup-nonexistent");
      },
      {
        message: /Backup .* not found/,
      }
    );
  });
});
