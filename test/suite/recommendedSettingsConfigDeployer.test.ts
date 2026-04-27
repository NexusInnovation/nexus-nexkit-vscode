/**
 * Tests for RecommendedSettingsConfigDeployer
 * Verifies that VS Code workspace settings are deployed correctly
 * including chat file locations and hooks configuration
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { RecommendedSettingsConfigDeployer } from "../../src/features/initialization/recommendedSettingsConfigDeployer";

suite("Unit: RecommendedSettingsConfigDeployer", () => {
  let deployer: RecommendedSettingsConfigDeployer;
  let tempDir: string;

  setup(async () => {
    deployer = new RecommendedSettingsConfigDeployer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-settings-test-"));
  });

  teardown(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should instantiate RecommendedSettingsConfigDeployer", () => {
    assert.ok(deployer);
  });

  test("Should create settings.json with all required chat settings", async () => {
    await deployer.deployVscodeSettings(tempDir);

    const settingsPath = path.join(tempDir, ".vscode", "settings.json");
    assert.ok(fs.existsSync(settingsPath));

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

    // Verify chat file locations
    assert.deepStrictEqual(content["chat.promptFilesLocations"], { ".nexkit/prompts": true });
    assert.deepStrictEqual(content["chat.instructionsFilesLocations"], { ".nexkit/instructions": true });
    assert.deepStrictEqual(content["chat.agentFilesLocations"], { ".nexkit/agents": true });
    assert.deepStrictEqual(content["chat.hookFilesLocations"], { ".nexkit/hooks": true });
    assert.deepStrictEqual(content["chat.agentSkillsLocations"], { ".nexkit/skills": true });

    // Verify hooks enabled
    assert.strictEqual(content["chat.useHooks"], true);
  });

  test("Should merge with existing settings without overwriting user values", async () => {
    const settingsDir = path.join(tempDir, ".vscode");
    fs.mkdirSync(settingsDir, { recursive: true });

    const existingSettings = {
      "editor.fontSize": 14,
      "chat.promptFilesLocations": {
        ".nexkit/prompts": true,
        "custom/prompts": true,
      },
    };
    fs.writeFileSync(path.join(settingsDir, "settings.json"), JSON.stringify(existingSettings, null, 2), "utf8");

    await deployer.deployVscodeSettings(tempDir);

    const content = JSON.parse(fs.readFileSync(path.join(settingsDir, "settings.json"), "utf8"));

    // User value should be preserved
    assert.strictEqual(content["editor.fontSize"], 14);

    // User's custom prompt path should be preserved alongside nexkit paths
    assert.strictEqual(content["chat.promptFilesLocations"]["custom/prompts"], true);
    assert.strictEqual(content["chat.promptFilesLocations"][".nexkit/prompts"], true);

    // New settings should be added
    assert.deepStrictEqual(content["chat.hookFilesLocations"], { ".nexkit/hooks": true });
    assert.strictEqual(content["chat.useHooks"], true);
  });

  test("Should create .vscode directory if it does not exist", async () => {
    await deployer.deployVscodeSettings(tempDir);

    const vscodeDir = path.join(tempDir, ".vscode");
    assert.ok(fs.existsSync(vscodeDir));
  });

  test("Should handle invalid existing settings.json gracefully", async () => {
    const settingsDir = path.join(tempDir, ".vscode");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, "settings.json"), "invalid json {{{", "utf8");

    // Should not throw
    await deployer.deployVscodeSettings(tempDir);

    const content = JSON.parse(fs.readFileSync(path.join(settingsDir, "settings.json"), "utf8"));
    // Template settings should be applied
    assert.strictEqual(content["chat.useHooks"], true);
    assert.deepStrictEqual(content["chat.hookFilesLocations"], { ".nexkit/hooks": true });
  });
});
