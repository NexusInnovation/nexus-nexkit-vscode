/**
 * Tests for BackupService
 * Handles backup and restore operations
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { BackupService } from "../../src/features/backup-management/backupService";

suite("Unit: BackupService", () => {
  let service: BackupService;
  let tempDir: string;

  setup(async () => {
    service = new BackupService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-backup-test-"));
  });

  teardown(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should instantiate BackupService", () => {
    assert.ok(service);
  });

  test("Should have backup methods", () => {
    assert.strictEqual(typeof service.backupDirectory, "function");
    assert.strictEqual(typeof service.listBackups, "function");
    assert.strictEqual(typeof service.restoreBackup, "function");
  });

  test("Should create backup of directory", async () => {
    // Create a test file to backup
    const sourceDir = path.join(tempDir, "source");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "test.txt"), "test content");

    const backupPath = await service.backupDirectory(sourceDir);

    assert.ok(backupPath);
    assert.ok(fs.existsSync(backupPath));
  });

  test("Should list backups in directory", async () => {
    const backupDir = tempDir;

    // Create some test backup directories
    fs.mkdirSync(path.join(backupDir, "test.backup-2024-01-01T12-00-00"));
    fs.mkdirSync(path.join(backupDir, "test.backup-2024-01-02T12-00-00"));

    const backups = await service.listBackups(backupDir, "test");

    assert.ok(Array.isArray(backups));
    assert.ok(backups.length >= 2);
  });

  test("Should handle non-existent source directory", async () => {
    const nonExistent = path.join(tempDir, "nonexistent");

    const result = await service.backupDirectory(nonExistent);
    assert.strictEqual(result, null);
  });
});
