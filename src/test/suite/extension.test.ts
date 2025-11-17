import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

suite("Unit: Extension Activation", () => {
  vscode.window.showInformationMessage("Running Nexkit extension tests");

  test("Extension should be present", () => {
    assert.ok(vscode.extensions.getExtension("nexusinno.nexkit-vscode"));
  });

  test("Should activate extension", async () => {
    const ext = vscode.extensions.getExtension("nexusinno.nexkit-vscode");
    assert.ok(ext);
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true);
  });

  test("Commands should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    const nexkitCommands = [
      "nexkit-vscode.initProject",
      "nexkit-vscode.updateTemplates",
      "nexkit-vscode.checkExtensionUpdate",
      "nexkit-vscode.installUserMCPs",
      "nexkit-vscode.configureAzureDevOps",
      "nexkit-vscode.openSettings",
      "nexkit-vscode.restoreBackup",
    ];

    nexkitCommands.forEach((cmd) => {
      assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
    });

    test("Activation events should include onStartupFinished", () => {
      const packageJsonPath = path.join(
        __dirname,
        "..",
        "..",
        "..",
        "package.json"
      );
      const packageJsonRaw = fs.readFileSync(packageJsonPath, "utf8");
      const packageJson = JSON.parse(packageJsonRaw);
      assert.ok(
        packageJson.activationEvents?.includes("onStartupFinished"),
        "Extension must activate on VS Code startup to perform background tasks."
      );
    });
  });
});
