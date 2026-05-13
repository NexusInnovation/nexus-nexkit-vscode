/**
 * Tests for TemplateFileOperations — user directory deployment mode
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as path from "path";
import { TemplateFileOperations } from "../../src/features/ai-template-files/services/templateFileOperations";
import { InstalledTemplatesStateManager } from "../../src/features/ai-template-files/services/installedTemplatesStateManager";
import { UserDirectoryService } from "../../src/features/ai-template-files/services/userDirectoryService";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: TemplateFileOperations User Directory Mode", () => {
  let sandbox: sinon.SinonSandbox;
  let userDirectoryService: UserDirectoryService;
  let mockFetcherService: any;
  let mockStateManager: any;
  let fileOps: TemplateFileOperations;

  const FAKE_STORAGE_ROOT = path.join("C:", "Users", "testuser", "AppData", "Roaming", "NexKit");
  const FAKE_PROJECT_ROOT = path.join(FAKE_STORAGE_ROOT, "project");

  setup(() => {
    sandbox = sinon.createSandbox();

    userDirectoryService = new UserDirectoryService();
    sandbox.stub(userDirectoryService, "getProjectNexkitRoot").returns(FAKE_PROJECT_ROOT);
    sandbox.stub(userDirectoryService, "getAbsoluteTemplateLocations").returns({
      agents: path.join(FAKE_PROJECT_ROOT, "agents"),
      prompts: path.join(FAKE_PROJECT_ROOT, "prompts"),
      skills: path.join(FAKE_PROJECT_ROOT, "skills"),
      instructions: path.join(FAKE_PROJECT_ROOT, "instructions"),
      chatmodes: path.join(FAKE_PROJECT_ROOT, "chatmodes"),
      hooks: path.join(FAKE_PROJECT_ROOT, "hooks"),
    });

    mockFetcherService = {
      downloadTemplate: sandbox.stub().resolves("# Template content"),
      downloadDirectoryContents: sandbox.stub().resolves(new Map([["SKILL.md", "# Skill"]])),
    };

    mockStateManager = {
      addInstalledTemplate: sandbox.stub().resolves(),
      removeInstalledTemplate: sandbox.stub().resolves(),
      isTemplateInstalled: sandbox.stub().returns(false),
      getInstalledTemplatesMap: sandbox.stub().returns({
        agents: [],
        prompts: [],
        skills: [],
        instructions: [],
        chatmodes: [],
        hooks: [],
      }),
    };

    fileOps = new TemplateFileOperations(mockFetcherService, mockStateManager, userDirectoryService);
  });

  teardown(() => {
    sandbox.restore();
  });

  test("getTemplateInstallPath returns user directory when in user mode", () => {
    sandbox.stub(SettingsManager, "isUserDeployMode").returns(true);

    const result = fileOps.getTemplateInstallPath();
    assert.strictEqual(result, FAKE_PROJECT_ROOT);
  });

  test("getTemplateInstallPath returns workspace path when in workspace mode", () => {
    sandbox.stub(SettingsManager, "isUserDeployMode").returns(false);
    // Mock getWorkspaceRoot
    const fileHelper = require("../../src/shared/utils/fileHelper");
    sandbox.stub(fileHelper, "getWorkspaceRoot").returns("C:\\workspace\\project");

    const result = fileOps.getTemplateInstallPath();
    assert.strictEqual(result, path.join("C:\\workspace\\project", ".nexkit"));
  });

  test("getTemplateInstallPath defaults to user mode", () => {
    // SettingsManager returns 'user' by default per package.json configuration
    sandbox.stub(SettingsManager, "getTemplateDeployMode").returns("user");
    sandbox.stub(SettingsManager, "isUserDeployMode").returns(true);

    const result = fileOps.getTemplateInstallPath();
    assert.strictEqual(result, FAKE_PROJECT_ROOT);
  });
});
