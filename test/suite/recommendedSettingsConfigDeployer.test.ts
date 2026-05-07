/**
 * Tests for RecommendedSettingsConfigDeployer
 * Verifies that chat location settings are deployed to user-level (global) scope
 * and that legacy workspace-level entries are cleaned up.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { RecommendedSettingsConfigDeployer } from "../../src/features/initialization/recommendedSettingsConfigDeployer";
import { UserDirectoryService } from "../../src/features/ai-template-files/services/userDirectoryService";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: RecommendedSettingsConfigDeployer", () => {
  let deployer: RecommendedSettingsConfigDeployer;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;
  let mockUserDirectory: sinon.SinonStubbedInstance<UserDirectoryService>;
  let updateStub: sinon.SinonStub;
  let inspectStub: sinon.SinonStub;

  const fakeLocations: Record<string, string> = {
    agents: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/agents",
    prompts: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/prompts",
    skills: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/skills",
    instructions: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/instructions",
    hooks: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/hooks",
    chatmodes: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/chatmodes",
  };

  setup(async () => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-settings-test-"));

    // Mock UserDirectoryService
    mockUserDirectory = sandbox.createStubInstance(UserDirectoryService);
    mockUserDirectory.getAbsoluteTemplateLocations.returns(fakeLocations);

    // Mock vscode.workspace.getConfiguration
    updateStub = sandbox.stub().resolves();
    inspectStub = sandbox.stub().returns({ globalValue: undefined });

    const fakeConfig = {
      inspect: inspectStub,
      update: updateStub,
      get: sandbox.stub(),
      has: sandbox.stub(),
    };
    sandbox.stub(vscode.workspace, "getConfiguration").returns(fakeConfig as any);

    deployer = new RecommendedSettingsConfigDeployer(mockUserDirectory as any);
  });

  teardown(async () => {
    sandbox.restore();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should instantiate RecommendedSettingsConfigDeployer", () => {
    assert.ok(deployer);
  });

  test("Should write all chat location settings to user-level (Global) scope", async () => {
    await deployer.deployVscodeSettings(tempDir);

    // Should call update for each chat location setting + useHooks
    const updateCalls = updateStub.getCalls();

    // Verify agentFilesLocations
    const agentCall = updateCalls.find((c: sinon.SinonSpyCall) => c.args[0] === "agentFilesLocations");
    assert.ok(agentCall, "Should update agentFilesLocations");
    assert.deepStrictEqual(agentCall.args[1], { "C:/Users/test/AppData/Roaming/Code/User/.nexkit/agents": true });
    assert.strictEqual(agentCall.args[2], vscode.ConfigurationTarget.Global);

    // Verify promptFilesLocations
    const promptCall = updateCalls.find((c: sinon.SinonSpyCall) => c.args[0] === "promptFilesLocations");
    assert.ok(promptCall, "Should update promptFilesLocations");
    assert.deepStrictEqual(promptCall.args[1], { "C:/Users/test/AppData/Roaming/Code/User/.nexkit/prompts": true });
    assert.strictEqual(promptCall.args[2], vscode.ConfigurationTarget.Global);

    // Verify useHooks
    const useHooksCall = updateCalls.find((c: sinon.SinonSpyCall) => c.args[0] === "useHooks");
    assert.ok(useHooksCall, "Should update useHooks");
    assert.strictEqual(useHooksCall.args[1], true);
    assert.strictEqual(useHooksCall.args[2], vscode.ConfigurationTarget.Global);
  });

  test("Should merge with existing user-level settings without overwriting", async () => {
    // Simulate existing user-level entries for promptFilesLocations
    inspectStub.callsFake((key: string) => {
      if (key === "promptFilesLocations") {
        return { globalValue: { "custom/my-prompts": true } };
      }
      return { globalValue: undefined };
    });

    await deployer.deployVscodeSettings(tempDir);

    const promptCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "promptFilesLocations");
    assert.ok(promptCall, "Should update promptFilesLocations");

    // Should contain both the existing custom entry and the nexkit entry
    assert.strictEqual(promptCall.args[1]["custom/my-prompts"], true);
    assert.strictEqual(promptCall.args[1]["C:/Users/test/AppData/Roaming/Code/User/.nexkit/prompts"], true);
  });

  test("Should not update useHooks if already set to true at user-level", async () => {
    inspectStub.callsFake((key: string) => {
      if (key === "useHooks") {
        return { globalValue: true };
      }
      return { globalValue: undefined };
    });

    await deployer.deployVscodeSettings(tempDir);

    const useHooksCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "useHooks");
    assert.ok(!useHooksCall, "Should NOT update useHooks when already true");
  });

  test("Should use forward slashes in paths even on Windows", async () => {
    // Simulate Windows-style backslash paths from UserDirectoryService
    mockUserDirectory.getAbsoluteTemplateLocations.returns({
      agents: "C:\\Users\\test\\AppData\\Roaming\\Code\\User\\.nexkit\\agents",
      prompts: "C:\\Users\\test\\AppData\\Roaming\\Code\\User\\.nexkit\\prompts",
      skills: "C:\\Users\\test\\AppData\\Roaming\\Code\\User\\.nexkit\\skills",
      instructions: "C:\\Users\\test\\AppData\\Roaming\\Code\\User\\.nexkit\\instructions",
      hooks: "C:\\Users\\test\\AppData\\Roaming\\Code\\User\\.nexkit\\hooks",
      chatmodes: "C:\\Users\\test\\AppData\\Roaming\\Code\\User\\.nexkit\\chatmodes",
    });

    await deployer.deployVscodeSettings(tempDir);

    const agentCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "agentFilesLocations");
    assert.ok(agentCall, "Should update agentFilesLocations");

    // Keys should use forward slashes
    const keys = Object.keys(agentCall.args[1]);
    assert.ok(
      keys.every((k: string) => !k.includes("\\")),
      "Paths should use forward slashes only"
    );
    assert.ok(keys.includes("C:/Users/test/AppData/Roaming/Code/User/.nexkit/agents"));
  });

  test("Should clean up legacy .nexkit/ entries from workspace settings.json", async () => {
    const settingsDir = path.join(tempDir, ".vscode");
    fs.mkdirSync(settingsDir, { recursive: true });

    const existingSettings = {
      "editor.fontSize": 14,
      "chat.promptFilesLocations": {
        ".nexkit/prompts": true,
        "custom/prompts": true,
      },
      "chat.useHooks": true,
    };
    fs.writeFileSync(path.join(settingsDir, "settings.json"), JSON.stringify(existingSettings, null, 2), "utf8");

    await deployer.deployVscodeSettings(tempDir);

    const content = JSON.parse(fs.readFileSync(path.join(settingsDir, "settings.json"), "utf8"));

    // User's non-NexKit value should be preserved
    assert.strictEqual(content["editor.fontSize"], 14);

    // User's custom prompt path should be preserved, .nexkit/ entry removed
    assert.strictEqual(content["chat.promptFilesLocations"]["custom/prompts"], true);
    assert.strictEqual(content["chat.promptFilesLocations"][".nexkit/prompts"], undefined);

    // chat.useHooks should be removed from workspace (now user-level)
    assert.strictEqual(content["chat.useHooks"], undefined);
  });

  test("Should remove empty settings.json after cleanup", async () => {
    const settingsDir = path.join(tempDir, ".vscode");
    fs.mkdirSync(settingsDir, { recursive: true });

    // Settings that contain ONLY nexkit entries
    const existingSettings = {
      "chat.agentFilesLocations": { ".nexkit/agents": true },
      "chat.useHooks": true,
    };
    fs.writeFileSync(path.join(settingsDir, "settings.json"), JSON.stringify(existingSettings, null, 2), "utf8");

    await deployer.deployVscodeSettings(tempDir);

    // File should be removed since it's now empty
    assert.ok(!fs.existsSync(path.join(settingsDir, "settings.json")), "Empty settings.json should be removed");
  });

  test("Should handle missing workspace settings.json gracefully", async () => {
    // No .vscode/settings.json exists — should not throw
    await deployer.deployVscodeSettings(tempDir);

    // Should still write user-level settings
    assert.ok(updateStub.called, "Should still write user-level settings");
  });

  test("Should handle invalid workspace settings.json gracefully during cleanup", async () => {
    const settingsDir = path.join(tempDir, ".vscode");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, "settings.json"), "invalid json {{{", "utf8");

    // Should not throw
    await deployer.deployVscodeSettings(tempDir);

    // User-level settings should still be written
    assert.ok(updateStub.called, "Should still write user-level settings despite invalid workspace file");
  });
});

suite("Unit: RecommendedSettingsConfigDeployer — Workspace Override (Layering)", () => {
  let deployer: RecommendedSettingsConfigDeployer;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;
  let mockUserDirectory: sinon.SinonStubbedInstance<UserDirectoryService>;
  let updateStub: sinon.SinonStub;
  let inspectStub: sinon.SinonStub;

  const fakeLocations: Record<string, string> = {
    agents: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/agents",
    prompts: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/prompts",
    skills: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/skills",
    instructions: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/instructions",
    hooks: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/hooks",
    chatmodes: "C:/Users/test/AppData/Roaming/Code/User/.nexkit/chatmodes",
  };

  setup(async () => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-workspace-override-test-"));

    // Mock UserDirectoryService
    mockUserDirectory = sandbox.createStubInstance(UserDirectoryService);
    mockUserDirectory.getAbsoluteTemplateLocations.returns(fakeLocations);

    // Mock vscode.workspace.getConfiguration
    updateStub = sandbox.stub().resolves();
    inspectStub = sandbox.stub().returns({ globalValue: undefined });

    const fakeConfig = {
      inspect: inspectStub,
      update: updateStub,
      get: sandbox.stub(),
      has: sandbox.stub(),
    };
    sandbox.stub(vscode.workspace, "getConfiguration").returns(fakeConfig as any);

    deployer = new RecommendedSettingsConfigDeployer(mockUserDirectory as any);
  });

  teardown(async () => {
    sandbox.restore();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should add workspace paths alongside user paths when workspace override is active", async () => {
    sandbox.stub(SettingsManager, "isWorkspaceOverrideActive").returns(true);

    await deployer.deployVscodeSettings(tempDir);

    const agentCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "agentFilesLocations");
    assert.ok(agentCall, "Should update agentFilesLocations");

    const locations = agentCall.args[1] as Record<string, boolean>;
    // Should have both user-level and workspace paths
    assert.strictEqual(locations["C:/Users/test/AppData/Roaming/Code/User/.nexkit/agents"], true, "User path should be present");

    const expectedWorkspacePath = path.join(tempDir, ".nexkit", "agents").replace(/\\/g, "/");
    assert.strictEqual(locations[expectedWorkspacePath], true, "Workspace path should be present");
  });

  test("Should NOT add workspace paths when workspace override is not active", async () => {
    sandbox.stub(SettingsManager, "isWorkspaceOverrideActive").returns(false);

    await deployer.deployVscodeSettings(tempDir);

    const agentCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "agentFilesLocations");
    assert.ok(agentCall, "Should update agentFilesLocations");

    const locations = agentCall.args[1] as Record<string, boolean>;
    // Should only have user-level path
    assert.strictEqual(locations["C:/Users/test/AppData/Roaming/Code/User/.nexkit/agents"], true, "User path should be present");

    const workspacePath = path.join(tempDir, ".nexkit", "agents").replace(/\\/g, "/");
    assert.strictEqual(locations[workspacePath], undefined, "Workspace path should NOT be present");
  });

  test("Should add workspace paths for all template types when override is active", async () => {
    sandbox.stub(SettingsManager, "isWorkspaceOverrideActive").returns(true);

    await deployer.deployVscodeSettings(tempDir);

    const settingKeys = [
      "agentFilesLocations",
      "agentSkillsLocations",
      "hookFilesLocations",
      "instructionsFilesLocations",
      "promptFilesLocations",
    ];
    const subdirs = ["agents", "skills", "hooks", "instructions", "prompts"];

    for (let i = 0; i < settingKeys.length; i++) {
      const call = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === settingKeys[i]);
      assert.ok(call, `Should update ${settingKeys[i]}`);

      const locations = call.args[1] as Record<string, boolean>;
      const expectedWorkspacePath = path.join(tempDir, ".nexkit", subdirs[i]).replace(/\\/g, "/");
      assert.strictEqual(locations[expectedWorkspacePath], true, `Workspace path for ${subdirs[i]} should be present`);
    }
  });

  test("Should merge workspace paths with existing user entries", async () => {
    sandbox.stub(SettingsManager, "isWorkspaceOverrideActive").returns(true);

    // Simulate existing user-level entries
    inspectStub.callsFake((key: string) => {
      if (key === "promptFilesLocations") {
        return { globalValue: { "custom/my-prompts": true } };
      }
      return { globalValue: undefined };
    });

    await deployer.deployVscodeSettings(tempDir);

    const promptCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "promptFilesLocations");
    assert.ok(promptCall, "Should update promptFilesLocations");

    const locations = promptCall.args[1] as Record<string, boolean>;
    // Should contain existing custom entry, user nexkit path, and workspace path
    assert.strictEqual(locations["custom/my-prompts"], true, "Existing custom entry should be preserved");
    assert.strictEqual(locations["C:/Users/test/AppData/Roaming/Code/User/.nexkit/prompts"], true, "User path should be present");

    const expectedWorkspacePath = path.join(tempDir, ".nexkit", "prompts").replace(/\\/g, "/");
    assert.strictEqual(locations[expectedWorkspacePath], true, "Workspace path should be present");
  });
});
