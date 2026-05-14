import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
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

  const fakeProjectLocations: Record<string, string> = {
    agents: "C:/Users/test/AppData/Roaming/NexKit/my-project/agents",
    prompts: "C:/Users/test/AppData/Roaming/NexKit/my-project/prompts",
    skills: "C:/Users/test/AppData/Roaming/NexKit/my-project/skills",
    instructions: "C:/Users/test/AppData/Roaming/NexKit/my-project/instructions",
    hooks: "C:/Users/test/AppData/Roaming/NexKit/my-project/hooks",
    chatmodes: "C:/Users/test/AppData/Roaming/NexKit/my-project/chatmodes",
  };

  const fakeGlobalLocations: Record<string, string> = {
    agents: "C:/Users/test/AppData/Roaming/NexKit/.global/agents",
    prompts: "C:/Users/test/AppData/Roaming/NexKit/.global/prompts",
    skills: "C:/Users/test/AppData/Roaming/NexKit/.global/skills",
    instructions: "C:/Users/test/AppData/Roaming/NexKit/.global/instructions",
    hooks: "C:/Users/test/AppData/Roaming/NexKit/.global/hooks",
    chatmodes: "C:/Users/test/AppData/Roaming/NexKit/.global/chatmodes",
  };

  setup(async () => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-settings-test-"));

    sandbox.stub(os, "homedir").returns("C:\\Users\\test");
    sandbox.stub(SettingsManager, "isWorkspaceOverrideActive").returns(false);

    mockUserDirectory = sandbox.createStubInstance(UserDirectoryService);
    mockUserDirectory.getAbsoluteTemplateLocations.returns(fakeProjectLocations);
    mockUserDirectory.getAbsoluteGlobalTemplateLocations.returns(fakeGlobalLocations);
    mockUserDirectory.ensureUserDirectoryStructure.resolves();

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

  teardown(() => {
    sandbox.restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("Should instantiate RecommendedSettingsConfigDeployer", () => {
    assert.ok(deployer);
  });

  test("Should write chat settings at global scope", async () => {
    await deployer.deployVscodeSettings(tempDir);

    const agentCall = updateStub.getCalls().find((c) => c.args[0] === "agentFilesLocations");
    assert.ok(agentCall);
    assert.deepStrictEqual(agentCall?.args[1], {
      "~/AppData/Roaming/NexKit/.global/agents": true,
      "~/AppData/Roaming/NexKit/my-project/agents": true,
    });
    assert.strictEqual(agentCall?.args[2], vscode.ConfigurationTarget.Global);

    const useHooksCall = updateStub.getCalls().find((c) => c.args[0] === "useHooks");
    assert.ok(useHooksCall);
    assert.strictEqual(useHooksCall?.args[1], true);
  });

  test("Should merge existing user-level entries", async () => {
    inspectStub.callsFake((key: string) => {
      if (key === "promptFilesLocations") {
        return { globalValue: { "custom/my-prompts": true } };
      }
      return { globalValue: undefined };
    });

    await deployer.deployVscodeSettings(tempDir);

    const promptCall = updateStub.getCalls().find((c) => c.args[0] === "promptFilesLocations");
    assert.ok(promptCall);
    assert.strictEqual(promptCall?.args[1]["custom/my-prompts"], true);
    assert.strictEqual(promptCall?.args[1]["~/AppData/Roaming/NexKit/.global/prompts"], true);
    assert.strictEqual(promptCall?.args[1]["~/AppData/Roaming/NexKit/my-project/prompts"], true);
  });

  test("Should cleanup legacy .nexkit entries from workspace settings", async () => {
    const vscodeDir = path.join(tempDir, ".vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });

    const settingsPath = path.join(vscodeDir, "settings.json");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          "editor.fontSize": 14,
          "chat.promptFilesLocations": {
            ".nexkit/prompts": true,
            "custom/prompts": true,
          },
          "chat.useHooks": true,
        },
        null,
        2
      ),
      "utf8"
    );

    await deployer.deployVscodeSettings(tempDir);

    const cleaned = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.strictEqual(cleaned["editor.fontSize"], 14);
    assert.strictEqual(cleaned["chat.promptFilesLocations"]["custom/prompts"], true);
    assert.strictEqual(cleaned["chat.promptFilesLocations"][".nexkit/prompts"], undefined);
    assert.strictEqual(cleaned["chat.useHooks"], undefined);
  });

  test("Should add workspace relative paths when workspace override is active", async () => {
    (SettingsManager.isWorkspaceOverrideActive as sinon.SinonStub).returns(true);

    await deployer.deployVscodeSettings(tempDir);

    const agentCall = updateStub.getCalls().find((c) => c.args[0] === "agentFilesLocations");
    assert.ok(agentCall);
    assert.strictEqual(agentCall?.args[1][".nexkit/agents"], true);
    assert.strictEqual(agentCall?.args[1]["~/AppData/Roaming/NexKit/.global/agents"], true);
    assert.strictEqual(agentCall?.args[1]["~/AppData/Roaming/NexKit/my-project/agents"], true);
  });

  test("Should remove stale ~/AppData/Roaming/ paths that are not valid NexKit paths", async () => {
    inspectStub.callsFake((key: string) => {
      if (key === "instructionsFilesLocations") {
        return {
          globalValue: {
            "~/AppData/Roaming/Code/User/.nexkit/instructions": true, // legacy stale path
            "~/AppData/Roaming/NexKit/.global/instructions": true, // valid — keep
            "~/AppData/Roaming/NexKit/my-project/instructions": true, // valid — keep
            "custom/instructions": true, // non-system path — keep
          },
        };
      }
      return { globalValue: undefined };
    });

    await deployer.deployVscodeSettings(tempDir);

    const call = updateStub.getCalls().find((c) => c.args[0] === "instructionsFilesLocations");
    assert.ok(call);
    const result = call?.args[1] as Record<string, boolean>;

    // Stale AppData path removed
    assert.strictEqual(result["~/AppData/Roaming/Code/User/.nexkit/instructions"], undefined);
    // Valid NexKit paths preserved
    assert.strictEqual(result["~/AppData/Roaming/NexKit/.global/instructions"], true);
    assert.strictEqual(result["~/AppData/Roaming/NexKit/my-project/instructions"], true);
    // Custom non-system path preserved
    assert.strictEqual(result["custom/instructions"], true);
  });

  test("Should remove stale ~/Library/Application Support/ paths on macOS", async () => {
    inspectStub.callsFake((key: string) => {
      if (key === "promptFilesLocations") {
        return {
          globalValue: {
            "~/Library/Application Support/Code/User/.nexkit/prompts": true, // stale macOS path
            "custom/prompts": true,
          },
        };
      }
      return { globalValue: undefined };
    });

    await deployer.deployVscodeSettings(tempDir);

    const call = updateStub.getCalls().find((c) => c.args[0] === "promptFilesLocations");
    assert.ok(call);
    const result = call?.args[1] as Record<string, boolean>;

    assert.strictEqual(result["~/Library/Application Support/Code/User/.nexkit/prompts"], undefined);
    assert.strictEqual(result["custom/prompts"], true);
  });

  test("Should remove stale ~/.config/ paths on Linux", async () => {
    inspectStub.callsFake((key: string) => {
      if (key === "agentFilesLocations") {
        return {
          globalValue: {
            "~/.config/Code/User/.nexkit/agents": true, // stale Linux path
            "custom/agents": true,
          },
        };
      }
      return { globalValue: undefined };
    });

    await deployer.deployVscodeSettings(tempDir);

    const call = updateStub.getCalls().find((c) => c.args[0] === "agentFilesLocations");
    assert.ok(call);
    const result = call?.args[1] as Record<string, boolean>;

    assert.strictEqual(result["~/.config/Code/User/.nexkit/agents"], undefined);
    assert.strictEqual(result["custom/agents"], true);
  });
});
