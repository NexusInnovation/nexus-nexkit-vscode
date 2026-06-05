import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { RecommendedSettingsConfigDeployer } from "../../src/features/initialization/recommendedSettingsConfigDeployer";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: RecommendedSettingsConfigDeployer", () => {
  let deployer: RecommendedSettingsConfigDeployer;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;
  let updateStub: sinon.SinonStub;
  let inspectStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-settings-test-"));

    updateStub = sandbox.stub().resolves();
    inspectStub = sandbox.stub().returns({ globalValue: undefined });

    const fakeConfig = {
      inspect: inspectStub,
      update: updateStub,
      get: sandbox.stub(),
      has: sandbox.stub(),
    };
    sandbox.stub(vscode.workspace, "getConfiguration").returns(fakeConfig as any);

    deployer = new RecommendedSettingsConfigDeployer();
  });

  teardown(() => {
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

  test("Should write workspace-relative chat location settings to user-level (Global) scope", async () => {
    await deployer.deployVscodeSettings(tempDir);

    const updateCalls = updateStub.getCalls();
    const agentCall = updateCalls.find((c: sinon.SinonSpyCall) => c.args[0] === "agentFilesLocations");
    assert.ok(agentCall, "Should update agentFilesLocations");
    assert.deepStrictEqual(agentCall.args[1], {
      ".nexkit/agents": true,
    });
    assert.strictEqual(agentCall.args[2], vscode.ConfigurationTarget.Global);

    const promptCall = updateCalls.find((c: sinon.SinonSpyCall) => c.args[0] === "promptFilesLocations");
    assert.ok(promptCall, "Should update promptFilesLocations");
    assert.deepStrictEqual(promptCall.args[1], {
      ".nexkit/prompts": true,
    });
    assert.strictEqual(promptCall.args[2], vscode.ConfigurationTarget.Global);

    const useHooksCall = updateCalls.find((c: sinon.SinonSpyCall) => c.args[0] === "useHooks");
    assert.ok(useHooksCall, "Should update useHooks");
    assert.strictEqual(useHooksCall.args[1], true);
    assert.strictEqual(useHooksCall.args[2], vscode.ConfigurationTarget.Global);
  });

  test("Should merge with existing user-level settings without overwriting", async () => {
    inspectStub.callsFake((key: string) => {
      if (key === "promptFilesLocations") {
        return { globalValue: { "custom/my-prompts": true } };
      }
      return { globalValue: undefined };
    });

    await deployer.deployVscodeSettings(tempDir);

    const promptCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "promptFilesLocations");
    assert.ok(promptCall, "Should update promptFilesLocations");
    assert.strictEqual(promptCall.args[1]["custom/my-prompts"], true);
    assert.strictEqual(promptCall.args[1][".nexkit/prompts"], true);
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
    assert.strictEqual(content["editor.fontSize"], 14);
    assert.strictEqual(content["chat.promptFilesLocations"]["custom/prompts"], true);
    assert.strictEqual(content["chat.promptFilesLocations"][".nexkit/prompts"], undefined);
    assert.strictEqual(content["chat.useHooks"], undefined);
  });

  test("Should remove empty settings.json after cleanup", async () => {
    const settingsDir = path.join(tempDir, ".vscode");
    fs.mkdirSync(settingsDir, { recursive: true });

    const existingSettings = {
      "chat.agentFilesLocations": { ".nexkit/agents": true },
      "chat.useHooks": true,
    };
    fs.writeFileSync(path.join(settingsDir, "settings.json"), JSON.stringify(existingSettings, null, 2), "utf8");

    await deployer.deployVscodeSettings(tempDir);

    assert.ok(!fs.existsSync(path.join(settingsDir, "settings.json")), "Empty settings.json should be removed");
  });

  test("Should handle missing workspace settings.json gracefully", async () => {
    await deployer.deployVscodeSettings(tempDir);
    assert.ok(updateStub.called, "Should still write user-level settings");
  });

  test("Should handle invalid workspace settings.json gracefully during cleanup", async () => {
    const settingsDir = path.join(tempDir, ".vscode");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, "settings.json"), "invalid json {{{", "utf8");

    await deployer.deployVscodeSettings(tempDir);
    assert.ok(updateStub.called, "Should still write user-level settings despite invalid workspace file");
  });
});

suite("Unit: RecommendedSettingsConfigDeployer — Workspace Paths", () => {
  let deployer: RecommendedSettingsConfigDeployer;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;
  let updateStub: sinon.SinonStub;
  let inspectStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-workspace-override-test-"));

    updateStub = sandbox.stub().resolves();
    inspectStub = sandbox.stub().returns({ globalValue: undefined });

    const fakeConfig = {
      inspect: inspectStub,
      update: updateStub,
      get: sandbox.stub(),
      has: sandbox.stub(),
    };
    sandbox.stub(vscode.workspace, "getConfiguration").returns(fakeConfig as any);

    deployer = new RecommendedSettingsConfigDeployer();
  });

  teardown(() => {
    sandbox.restore();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should add relative workspace paths to global chat settings", async () => {
    await deployer.deployVscodeSettings(tempDir);

    const agentCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "agentFilesLocations");
    assert.ok(agentCall, "Should update agentFilesLocations");

    const locations = agentCall.args[1] as Record<string, boolean>;
    assert.strictEqual(locations[".nexkit/agents"], true, "Relative workspace path should be present");
  });

  test("Should always add workspace paths even if deploy mode remains user", async () => {
    sandbox.stub(SettingsManager, "getTemplateDeployMode").returns("user");

    await deployer.deployVscodeSettings(tempDir);

    const agentCall = updateStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === "agentFilesLocations");
    assert.ok(agentCall, "Should update agentFilesLocations");

    const locations = agentCall.args[1] as Record<string, boolean>;
    assert.strictEqual(locations[".nexkit/agents"], true, "Workspace path should always be present");
  });

  test("Should add relative workspace paths for all template types", async () => {
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
      assert.strictEqual(locations[`.nexkit/${subdirs[i]}`], true, `Relative workspace path for ${subdirs[i]} should be present`);
    }
  });

  test("Should merge workspace paths with existing user entries", async () => {
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
    assert.strictEqual(locations["custom/my-prompts"], true, "Existing custom entry should be preserved");
    assert.strictEqual(locations[".nexkit/prompts"], true, "Relative workspace path should be present");
  });
});
