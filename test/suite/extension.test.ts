/**
 * Tests for extension activation and basic functionality
 * Note: These tests are pending because @vscode/test-electron does not
 * automatically load extensions in the test environment, even with correct configuration.
 * The extension IS properly activated in real VS Code instances.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { isNexkitOwnedException } from "../../src/extension";

const EXTENSION_NAME = "nexus-nexkit-vscode";

function getNexkitExtension(): vscode.Extension<any> | undefined {
  return vscode.extensions.all.find((e) => e.packageJSON?.name === EXTENSION_NAME);
}

suite("Unit: Extension Activation", () => {
  vscode.window.showInformationMessage("Running Nexkit extension tests");

  suite("global error ownership", () => {
    test("accepts a Windows Nexkit compiled-source stack", () => {
      const error = new Error("Nexkit failure");
      error.stack = "Error: Nexkit failure\n    at task (C:\\Users\\dev\\.vscode\\extensions\\nexusinnovation.nexkit-3.10.2\\out\\extension.js:10:5)";

      assert.strictEqual(
        isNexkitOwnedException(error, "C:\\Users\\dev\\.vscode\\extensions\\nexusinnovation.nexkit-3.10.2"),
        true
      );
    });

    test("accepts a POSIX Nexkit compiled-source stack", () => {
      const error = new Error("Nexkit failure");
      error.stack = "Error: Nexkit failure\n    at task (/home/dev/.vscode/extensions/nexusinnovation.nexkit-3.10.2/out/extension.js:10:5)";

      assert.strictEqual(
        isNexkitOwnedException(error, "/home/dev/.vscode/extensions/nexusinnovation.nexkit-3.10.2"),
        true
      );
    });

    test("rejects a Copilot stack", () => {
      const error = new Error("e is not iterable");
      error.stack = "TypeError: e is not iterable\n    at task (C:\\Users\\dev\\.vscode\\extensions\\copilot\\dist\\extension.js:10:5)";

      assert.strictEqual(
        isNexkitOwnedException(error, "C:\\Users\\dev\\.vscode\\extensions\\nexusinnovation.nexkit-3.10.2"),
        false
      );
    });

    test("requires an explicit Nexkit marker when no stack is available", () => {
      assert.strictEqual(isNexkitOwnedException({ nexkitOwned: true }, "/extensions/nexkit"), true);
      assert.strictEqual(isNexkitOwnedException(new Error("unknown"), "/extensions/nexkit"), false);
    });
  });

  test.skip("Extension should be present", () => {
    const ext = getNexkitExtension();
    assert.ok(ext, `Expected extension with name '${EXTENSION_NAME}' to be present in the extension host.`);
  });

  test.skip("Should activate extension", async () => {
    const ext = getNexkitExtension();
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test.skip("Commands should be registered", async () => {
    // Commands are registered during activation.
    const ext = getNexkitExtension();
    assert.ok(ext);
    await ext.activate();
    const commands = await vscode.commands.getCommands(true);
    const nexkitCommands = [
      "nexus-nexkit-vscode.initProject",
      "nexus-nexkit-vscode.updateTemplates",
      "nexus-nexkit-vscode.checkExtensionUpdate",
      "nexus-nexkit-vscode.installUserMCPs",
      "nexus-nexkit-vscode.configureAzureDevOps",
      "nexus-nexkit-vscode.openSettings",
      "nexus-nexkit-vscode.restoreBackup",
    ];
    nexkitCommands.forEach((cmd) => {
      assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
    });
  });

  test("Activation events should include onStartupFinished", () => {
    const packageJsonPath = path.join(__dirname, "..", "..", "..", "package.json");
    const packageJsonRaw = fs.readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw);
    assert.ok(
      packageJson.activationEvents?.includes("onStartupFinished"),
      "Extension must activate on VS Code startup to perform background tasks."
    );
  });

  test("Panel title bar should contribute a home action", () => {
    const packageJsonPath = path.join(__dirname, "..", "..", "..", "package.json");
    const packageJsonRaw = fs.readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw);

    const command = packageJson.contributes?.commands?.find(
      (entry: { command: string }) => entry.command === "nexus-nexkit-vscode.goToModeSelection"
    );
    assert.ok(command, "Expected a goToModeSelection command contribution.");
    assert.strictEqual(command.icon, "$(home)");

    const menuEntry = packageJson.contributes?.menus?.["view/title"]?.find(
      (entry: { command: string }) => entry.command === "nexus-nexkit-vscode.goToModeSelection"
    );
    assert.ok(menuEntry, "Expected the home action in the panel title bar menu.");
    assert.strictEqual(menuEntry.when, "view == nexkitPanelView && nexkit.modeSelected");
    assert.strictEqual(menuEntry.group, "navigation@1");
  });

  test("Should contribute Convert to Markdown command", () => {
    const packageJsonPath = path.join(__dirname, "..", "..", "..", "package.json");
    const packageJsonRaw = fs.readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw);

    const command = packageJson.contributes?.commands?.find(
      (entry: { command: string }) => entry.command === "nexus-nexkit-vscode.openConvertToMarkdown"
    );
    assert.ok(command, "Expected openConvertToMarkdown command contribution.");
    assert.strictEqual(command.title, "Nexkit: Convert to Markdown");
    assert.strictEqual(command.category, "Nexkit");
  });
});
