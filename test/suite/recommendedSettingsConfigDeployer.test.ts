/**
 * Tests for RecommendedSettingsConfigDeployer
 * Verifies that VS Code user-global settings are deployed correctly
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import { RecommendedSettingsConfigDeployer } from "../../src/features/initialization/recommendedSettingsConfigDeployer";
import { getNexkitUserDirectory } from "../../src/shared/utils/fileHelper";

suite("Unit: RecommendedSettingsConfigDeployer", () => {
  let deployer: RecommendedSettingsConfigDeployer;
  let tempDir: string;
  let originalHome: string | undefined;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
  let configStore: Record<string, any>;
  let updateCalls: Array<{ key: string; value: any; target: vscode.ConfigurationTarget }>;

  setup(async () => {
    deployer = new RecommendedSettingsConfigDeployer();
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nexkit-settings-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    configStore = {};
    updateCalls = [];
    originalGetConfiguration = vscode.workspace.getConfiguration;
    (vscode.workspace as any).getConfiguration = () =>
      ({
        get: (key: string, defaultValue?: any) => (key in configStore ? configStore[key] : defaultValue),
        update: async (key: string, value: any, target: vscode.ConfigurationTarget) => {
          updateCalls.push({ key, value, target });
          configStore[key] = value;
        },
      }) as any;
  });

  teardown(async () => {
    (vscode.workspace as any).getConfiguration = originalGetConfiguration;
    process.env.HOME = originalHome;
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should instantiate RecommendedSettingsConfigDeployer", () => {
    assert.ok(deployer);
  });

  test("Should write all required chat settings to user-global configuration", async () => {
    await deployer.deployVscodeSettings(tempDir);
    const nexkitDir = getNexkitUserDirectory(vscode.env.appName);

    // Verify chat file locations
    assert.deepStrictEqual(configStore["chat.promptFilesLocations"], { [path.join(nexkitDir, "prompts")]: true });
    assert.deepStrictEqual(configStore["chat.instructionsFilesLocations"], { [path.join(nexkitDir, "instructions")]: true });
    assert.deepStrictEqual(configStore["chat.agentFilesLocations"], { [path.join(nexkitDir, "agents")]: true });
    assert.deepStrictEqual(configStore["chat.hookFilesLocations"], { [path.join(nexkitDir, "hooks")]: true });
    assert.deepStrictEqual(configStore["chat.agentSkillsLocations"], { [path.join(nexkitDir, "skills")]: true });

    // Verify hooks enabled
    assert.strictEqual(configStore["chat.useHooks"], true);
    assert.ok(updateCalls.every((call) => call.target === vscode.ConfigurationTarget.Global));
  });

  test("Should merge with existing global settings without overwriting user values", async () => {
    configStore["editor.fontSize"] = 14;
    configStore["chat.promptFilesLocations"] = {
      "custom/prompts": true,
    };

    await deployer.deployVscodeSettings(tempDir);
    const nexkitDir = getNexkitUserDirectory(vscode.env.appName);

    // Existing custom value should be preserved
    assert.strictEqual(configStore["editor.fontSize"], 14);
    assert.strictEqual(configStore["chat.promptFilesLocations"]["custom/prompts"], true);
    // Nexkit value should be added
    assert.strictEqual(configStore["chat.promptFilesLocations"][path.join(nexkitDir, "prompts")], true);
  });
});
