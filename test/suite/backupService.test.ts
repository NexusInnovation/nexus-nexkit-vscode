import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { GitHubTemplateBackupService } from "../../src/features/backup-management/backupService";
import { UserDirectoryService } from "../../src/features/ai-template-files/services/userDirectoryService";

suite("Unit: GitHubTemplateBackupService", () => {
  let tempDir: string;
  let nexkitDir: string;
  let userBackupDir: string;
  let sandbox: sinon.SinonSandbox;
  let service: GitHubTemplateBackupService;
  let originalHomeEnv: string | undefined;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-backup-test-"));
    originalHomeEnv = process.env.HOME;
    process.env.HOME = tempDir;

    nexkitDir = path.join(tempDir, "nexkit-project");
    userBackupDir = path.join(tempDir, "user-backups");

    const userDirectory = new UserDirectoryService();
    sandbox.stub(userDirectory, "getProjectNexkitRoot").callsFake(() => nexkitDir);
    sandbox.stub(userDirectory, "getUserBackupDir").callsFake(() => userBackupDir);

    service = new GitHubTemplateBackupService(userDirectory);
  });

  teardown(() => {
    process.env.HOME = originalHomeEnv;
    sandbox.restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("Should instantiate service", () => {
    assert.ok(service);
  });

  test("Should create backup and remove template folders", async () => {
    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "a.md"), "x");
    fs.mkdirSync(path.join(nexkitDir, "custom"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "custom", "keep.txt"), "k");

    const backupPath = await service.backupTemplates(tempDir);

    assert.ok(backupPath);
    assert.ok((backupPath as string).startsWith(userBackupDir));
    assert.ok(fs.existsSync(path.join(backupPath as string, "agents", "a.md")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "agents")));
    assert.ok(fs.existsSync(path.join(nexkitDir, "custom", "keep.txt")));
  });

  test("Should list backups newest first", async () => {
    fs.mkdirSync(path.join(userBackupDir, "2024-01-01_12-00-00"), { recursive: true });
    fs.mkdirSync(path.join(userBackupDir, "2024-01-02_12-00-00"), { recursive: true });

    const backups = await service.listBackups(tempDir);
    assert.deepStrictEqual(backups, ["2024-01-02_12-00-00", "2024-01-01_12-00-00"]);
  });

  test("Should cleanup backups by count", async () => {
    fs.mkdirSync(path.join(userBackupDir, "2024-01-01_12-00-00"), { recursive: true });
    fs.mkdirSync(path.join(userBackupDir, "2024-01-02_12-00-00"), { recursive: true });
    fs.mkdirSync(path.join(userBackupDir, "2024-01-03_12-00-00"), { recursive: true });

    await service.cleanupBackups(2, tempDir);

    const backups = await service.listBackups(tempDir);
    assert.deepStrictEqual(backups, ["2024-01-03_12-00-00", "2024-01-02_12-00-00"]);
  });

  test("Should cleanup all backups when maxToKeep is 0", async () => {
    fs.mkdirSync(path.join(userBackupDir, "2024-01-01_12-00-00"), { recursive: true });
    fs.mkdirSync(path.join(userBackupDir, "2024-01-02_12-00-00"), { recursive: true });

    await service.cleanupBackups(0, tempDir);

    const backups = await service.listBackups(tempDir);
    assert.strictEqual(backups.length, 0);
  });

  test("Should restore backup", async () => {
    const backupName = "2024-01-01_12-00-00";
    fs.mkdirSync(path.join(userBackupDir, backupName, "agents"), { recursive: true });
    fs.writeFileSync(path.join(userBackupDir, backupName, "agents", "restored.md"), "restored");

    fs.mkdirSync(path.join(nexkitDir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(nexkitDir, "agents", "current.md"), "current");

    await service.restoreBackup(tempDir, backupName);

    assert.ok(fs.existsSync(path.join(nexkitDir, "agents", "restored.md")));
    assert.ok(!fs.existsSync(path.join(nexkitDir, "agents", "current.md")));
  });

  test("Should throw when backup does not exist", async () => {
    await assert.rejects(async () => service.restoreBackup(tempDir, "missing-backup"), /Backup missing-backup not found/);
  });

  test("Should delete all backups when cleanupBackups called with 0", async () => {
    fs.mkdirSync(path.join(userBackupDir, "2024-01-01_12-00-00"), { recursive: true });
    fs.mkdirSync(path.join(userBackupDir, "2024-01-02_12-00-00"), { recursive: true });

    await service.cleanupBackups(0, tempDir);

    const remaining = await service.listBackups(tempDir);
    assert.strictEqual(remaining.length, 0);
  });
});
