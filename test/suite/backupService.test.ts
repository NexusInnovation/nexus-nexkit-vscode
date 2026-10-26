/**
 * Tests for GitHubTemplateBackupService
 * Handles backup and restore of workspace artifacts and backup retention
 * Backups are stored in user directory (simulated via UserDirectoryService)
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { GitHubTemplateBackupService } from "../../src/features/backup-management/backupService";
import { UserDirectoryService } from "../../src/shared/services/userDirectoryService";
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

  test("Should delete all backups when cleanupBackups called with 0", async () => {
    fs.mkdirSync(path.join(userBackupDir, "2024-01-01_12-00-00"));
    fs.mkdirSync(path.join(userBackupDir, "2024-01-02_12-00-00"));

    await service.cleanupBackups(0);

    const remaining = await service.listBackups();
    assert.strictEqual(remaining.length, 0);
  });

  test("backupWorkspaceArtifacts copies only existing listed paths under a labelled folder", async () => {
    const workspaceDir = path.join(tempDir, "workspace");
    fs.mkdirSync(path.join(workspaceDir, ".squad", "agents", "link"), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, ".squad", "team.md"), "team");
    fs.writeFileSync(path.join(workspaceDir, ".squad", "agents", "link", "charter.md"), "charter");

    const skillPath = path.join(".copilot", "skills", "missing");
    const backupPath = await service.backupWorkspaceArtifacts(workspaceDir, [".squad", skillPath], "squad-import");

    assert.ok(backupPath);
    assert.ok(path.basename(backupPath).startsWith("squad-import-"));
    assert.strictEqual(fs.readFileSync(path.join(backupPath, ".squad", "team.md"), "utf8"), "team");
    assert.strictEqual(
      fs.readFileSync(path.join(backupPath, ".squad", "agents", "link", "charter.md"), "utf8"),
      "charter"
    );
    assert.strictEqual(fs.existsSync(path.join(backupPath, skillPath)), false);
  });

  test("backupWorkspaceArtifacts returns null when no listed path exists", async () => {
    const workspaceDir = path.join(tempDir, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });

    const backupPath = await service.backupWorkspaceArtifacts(workspaceDir, [".squad"], "squad-import");

    assert.strictEqual(backupPath, null);
  });

  test("backupWorkspaceArtifacts rejects paths escaping the workspace and unsafe labels", async () => {
    const workspaceDir = path.join(tempDir, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });

    await assert.rejects(() => service.backupWorkspaceArtifacts(workspaceDir, ["../outside"], "squad-import"), /escapes/);
    await assert.rejects(() => service.backupWorkspaceArtifacts(workspaceDir, ["."], "squad-import"), /escapes/);
    await assert.rejects(() => service.backupWorkspaceArtifacts(workspaceDir, [".squad"], "../bad"), /Invalid backup label/);
  });

  test("restoreWorkspaceArtifacts restores backed-up paths and removes paths absent at backup time", async () => {
    const workspaceDir = path.join(tempDir, "workspace");
    fs.mkdirSync(path.join(workspaceDir, ".squad"), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, ".squad", "team.md"), "original");
    const skillPath = path.join(".copilot", "skills", "new-skill");
    const backupPath = await service.backupWorkspaceArtifacts(workspaceDir, [".squad", skillPath], "squad-import");
    assert.ok(backupPath);

    fs.writeFileSync(path.join(workspaceDir, ".squad", "team.md"), "imported");
    fs.writeFileSync(path.join(workspaceDir, ".squad", "extra.md"), "extra");
    fs.mkdirSync(path.join(workspaceDir, skillPath), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, skillPath, "SKILL.md"), "skill");

    await service.restoreWorkspaceArtifacts(workspaceDir, backupPath, [".squad", skillPath]);

    assert.strictEqual(fs.readFileSync(path.join(workspaceDir, ".squad", "team.md"), "utf8"), "original");
    assert.strictEqual(fs.existsSync(path.join(workspaceDir, ".squad", "extra.md")), false);
    assert.strictEqual(fs.existsSync(path.join(workspaceDir, skillPath)), false);
  });
});
