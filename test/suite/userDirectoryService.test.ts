/**
 * Tests for UserDirectoryService
 * Verifies platform-aware path resolution and directory structure creation.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sinon from "sinon";
import { UserDirectoryService } from "../../src/features/ai-template-files/services/userDirectoryService";

suite("Unit: UserDirectoryService", () => {
  let service: UserDirectoryService;
  let platformStub: sinon.SinonStub;
  let homedirStub: sinon.SinonStub;

  setup(() => {
    service = new UserDirectoryService();
    platformStub = sinon.stub(os, "platform");
    homedirStub = sinon.stub(os, "homedir");
  });

  teardown(() => {
    sinon.restore();
  });

  suite("getUserNexkitRoot()", () => {
    test("Should return correct path on Windows", () => {
      platformStub.returns("win32");
      homedirStub.returns("C:\\Users\\TestUser");

      const result = service.getUserNexkitRoot();

      assert.strictEqual(result, path.join("C:\\Users\\TestUser", "AppData", "Roaming", "Code", "User", ".nexkit"));
    });

    test("Should return correct path on macOS", () => {
      platformStub.returns("darwin");
      homedirStub.returns("/Users/testuser");

      const result = service.getUserNexkitRoot();

      assert.strictEqual(result, path.join("/Users/testuser", "Library", "Application Support", "Code", "User", ".nexkit"));
    });

    test("Should return correct path on Linux", () => {
      platformStub.returns("linux");
      homedirStub.returns("/home/testuser");

      const result = service.getUserNexkitRoot();

      assert.strictEqual(result, path.join("/home/testuser", ".config", "Code", "User", ".nexkit"));
    });

    test("Should cache the root path on subsequent calls", () => {
      platformStub.returns("win32");
      homedirStub.returns("C:\\Users\\TestUser");

      const first = service.getUserNexkitRoot();
      const second = service.getUserNexkitRoot();

      assert.strictEqual(first, second);
      // platform() is called only once due to caching
      assert.strictEqual(platformStub.callCount, 1);
    });
  });

  suite("ensureUserDirectoryStructure()", () => {
    let tempDir: string;

    setup(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-userdir-test-"));
    });

    teardown(() => {
      sinon.restore();
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    });

    test("Should create all template subdirectories", async () => {
      // Point the service to use a temp directory as root
      platformStub.returns("linux");
      homedirStub.returns(tempDir);

      // Override the expected path so .nexkit lands inside tempDir
      const expectedRoot = path.join(tempDir, ".config", "Code", "User", ".nexkit");

      await service.ensureUserDirectoryStructure();

      const expectedDirs = ["agents", "prompts", "skills", "instructions", "chatmodes", "hooks"];
      for (const dir of expectedDirs) {
        const dirPath = path.join(expectedRoot, dir);
        assert.ok(fs.existsSync(dirPath), `Expected directory to exist: ${dirPath}`);
      }
    });

    test("Should not throw if directories already exist", async () => {
      platformStub.returns("linux");
      homedirStub.returns(tempDir);

      // Call twice — should not throw
      await service.ensureUserDirectoryStructure();
      await service.ensureUserDirectoryStructure();
    });
  });

  suite("getAbsoluteTemplateLocations()", () => {
    test("Should return paths for all template types", () => {
      platformStub.returns("win32");
      homedirStub.returns("C:\\Users\\TestUser");

      const locations = service.getAbsoluteTemplateLocations();

      const expectedKeys = ["agents", "prompts", "skills", "instructions", "chatmodes", "hooks"];
      for (const key of expectedKeys) {
        assert.ok(key in locations, `Expected key "${key}" in locations`);
        assert.ok(locations[key].includes(".nexkit"), `Path for "${key}" should include .nexkit`);
        assert.ok(locations[key].endsWith(key), `Path for "${key}" should end with the key`);
      }
    });

    test("Should return consistent paths with getUserNexkitRoot()", () => {
      platformStub.returns("darwin");
      homedirStub.returns("/Users/testuser");

      const root = service.getUserNexkitRoot();
      const locations = service.getAbsoluteTemplateLocations();

      for (const [key, value] of Object.entries(locations)) {
        assert.strictEqual(value, path.join(root, key));
      }
    });
  });

  suite("getUserBackupDir()", () => {
    test("Should return backups path under nexkit root", () => {
      platformStub.returns("win32");
      homedirStub.returns("C:\\Users\\TestUser");

      const backupDir = service.getUserBackupDir();
      const root = service.getUserNexkitRoot();

      assert.strictEqual(backupDir, path.join(root, "backups"));
    });
  });
});
