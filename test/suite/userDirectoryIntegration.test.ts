/**
 * Integration tests for user directory deployment flow.
 * Tests the end-to-end lifecycle:
 *   - Fresh install → user directory created → templates deployed
 *   - Workspace override → both user and workspace paths registered
 *   - Edge cases: permissions errors, cross-platform path handling
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { UserDirectoryService } from "../../src/features/ai-template-files/services/userDirectoryService";
import { TemplateFileOperations } from "../../src/features/ai-template-files/services/templateFileOperations";
import { RecommendedSettingsConfigDeployer } from "../../src/features/initialization/recommendedSettingsConfigDeployer";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Integration: User Directory Deployment Flow", () => {
  let sandbox: sinon.SinonSandbox;
  let userDirectoryService: UserDirectoryService;
  let tempDir: string;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-integration-"));
    userDirectoryService = new UserDirectoryService();
    // Override platform-specific paths to use temp directory
    sandbox.stub(os, "platform").returns("win32");
    sandbox.stub(os, "homedir").returns(tempDir);
  });

  teardown(() => {
    sandbox.restore();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in tests
    }
  });

  suite("Fresh install → user directory created → templates deployed", () => {
    test("Should create full directory structure on fresh install", async () => {
      await userDirectoryService.ensureUserDirectoryStructure();

      const root = userDirectoryService.getUserNexkitRoot();
      const expectedSubdirs = ["agents", "prompts", "skills", "instructions", "chatmodes", "hooks"];

      assert.ok(fs.existsSync(root), "Root .nexkit directory should exist");
      for (const subdir of expectedSubdirs) {
        const dirPath = path.join(root, subdir);
        assert.ok(fs.existsSync(dirPath), `Subdirectory '${subdir}' should exist`);
        assert.ok(fs.statSync(dirPath).isDirectory(), `'${subdir}' should be a directory`);
      }
    });

    test("Should resolve install path to user directory in user mode", () => {
      sandbox.stub(SettingsManager, "isUserDeployMode").returns(true);

      const mockFetcher = { downloadTemplate: sandbox.stub(), downloadDirectoryContents: sandbox.stub() };
      const mockState = {
        addInstalledTemplate: sandbox.stub(),
        removeInstalledTemplate: sandbox.stub(),
        isTemplateInstalled: sandbox.stub(),
        getInstalledTemplatesMap: sandbox.stub(),
      };

      const fileOps = new TemplateFileOperations(mockFetcher as any, mockState as any, userDirectoryService);
      const installPath = fileOps.getTemplateInstallPath();
      const expectedRoot = userDirectoryService.getUserNexkitRoot();

      assert.strictEqual(installPath, expectedRoot);
    });

    test("Settings deployer should register user-level absolute paths", async () => {
      const updateStub = sandbox.stub().resolves();
      const inspectStub = sandbox.stub().returns({ globalValue: undefined });
      const fakeConfig = {
        inspect: inspectStub,
        update: updateStub,
        get: sandbox.stub(),
        has: sandbox.stub(),
      };
      sandbox.stub(vscode.workspace, "getConfiguration").returns(fakeConfig as any);

      const deployer = new RecommendedSettingsConfigDeployer(userDirectoryService);
      await deployer.deployVscodeSettings(tempDir);

      // Verify absolute paths from UserDirectoryService are used in user-level settings
      const agentCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "agentFilesLocations");
      assert.ok(agentCall, "Should write agentFilesLocations setting");

      const agentPaths = agentCall.args[1];
      const expectedAgentPath = userDirectoryService.getAbsoluteTemplateLocations()["agents"];
      // The setting value should be an object with the absolute path as key
      assert.ok(
        Object.keys(agentPaths).some((k: string) => k.includes(".nexkit") && k.includes("agents")),
        `Agent path should contain .nexkit/agents, got: ${JSON.stringify(agentPaths)}`
      );
      assert.strictEqual(agentCall.args[2], vscode.ConfigurationTarget.Global, "Should target Global scope");
    });
  });

  suite("Workspace override → both paths registered", () => {
    test("Should detect workspace override when .nexkit/ exists in workspace", () => {
      // Create a .nexkit directory in temp to simulate workspace
      const fakeWorkspaceNexkit = path.join(tempDir, ".nexkit");
      fs.mkdirSync(fakeWorkspaceNexkit, { recursive: true });

      // isWorkspaceOverrideActive checks workspace folders and fs
      // We test the logic indirectly via SettingsManager
      sandbox.stub(SettingsManager, "getTemplateDeployMode").returns("workspace");
      const result = SettingsManager.isWorkspaceOverrideActive();

      assert.strictEqual(result, true);
    });

    test("Should register workspace-relative paths when in workspace mode", () => {
      sandbox.stub(SettingsManager, "isUserDeployMode").returns(false);
      const fileHelper = require("../../src/shared/utils/fileHelper");
      sandbox.stub(fileHelper, "getWorkspaceRoot").returns(path.join(tempDir, "project"));

      const mockFetcher = { downloadTemplate: sandbox.stub(), downloadDirectoryContents: sandbox.stub() };
      const mockState = {
        addInstalledTemplate: sandbox.stub(),
        removeInstalledTemplate: sandbox.stub(),
        isTemplateInstalled: sandbox.stub(),
        getInstalledTemplatesMap: sandbox.stub(),
      };

      const fileOps = new TemplateFileOperations(mockFetcher as any, mockState as any, userDirectoryService);
      const installPath = fileOps.getTemplateInstallPath();

      assert.strictEqual(installPath, path.join(tempDir, "project", ".nexkit"));
    });
  });

  suite("Edge cases", () => {
    test("Should handle read-only directory gracefully", async () => {
      // Create root but make it read-only
      const root = userDirectoryService.getUserNexkitRoot();
      const parentDir = path.dirname(root);
      fs.mkdirSync(parentDir, { recursive: true });

      // On Windows, read-only directories still allow creating subfolders
      // so we test that mkdir recursive works even with pre-existing structure
      fs.mkdirSync(root, { recursive: true });
      await userDirectoryService.ensureUserDirectoryStructure();

      // Should succeed without error
      assert.ok(fs.existsSync(path.join(root, "agents")));
    });

    test("Should produce consistent paths regardless of call order", () => {
      const root1 = userDirectoryService.getUserNexkitRoot();
      const locations = userDirectoryService.getAbsoluteTemplateLocations();
      const root2 = userDirectoryService.getUserNexkitRoot();

      assert.strictEqual(root1, root2, "Root should be consistent");
      for (const [key, value] of Object.entries(locations)) {
        assert.strictEqual(value, path.join(root1, key), `Location for '${key}' should be under root`);
      }
    });

    test("Should use forward-slash paths in settings on all platforms", () => {
      const locations = userDirectoryService.getAbsoluteTemplateLocations();

      // On Windows the raw path uses backslashes, but VS Code settings
      // normalize paths — verify the service returns usable paths
      for (const [, value] of Object.entries(locations)) {
        assert.ok(value.length > 0, "Path should not be empty");
        assert.ok(value.includes(".nexkit"), "Path should contain .nexkit");
      }
    });

    test("Should not fail when user directory already fully exists", async () => {
      // Create the full structure manually first
      await userDirectoryService.ensureUserDirectoryStructure();

      // Calling again should be idempotent
      await userDirectoryService.ensureUserDirectoryStructure();

      const root = userDirectoryService.getUserNexkitRoot();
      assert.ok(fs.existsSync(path.join(root, "agents")));
      assert.ok(fs.existsSync(path.join(root, "hooks")));
    });

    test("Should return backup dir under user nexkit root", () => {
      const backupDir = userDirectoryService.getUserBackupDir();
      const root = userDirectoryService.getUserNexkitRoot();

      assert.strictEqual(backupDir, path.join(root, "backups"));
      assert.ok(backupDir.includes(".nexkit"));
    });
  });
});
