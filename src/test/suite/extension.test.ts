import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Commands } from "../../shared/constants/commands";

const EXTENSION_ID = "NexusInnovation.nexus-nexkit-vscode";

function getNexkitExtension(): vscode.Extension<any> | undefined {
  return vscode.extensions.getExtension(EXTENSION_ID);
}

suite("Unit: Extension Activation", () => {
  vscode.window.showInformationMessage("Running Nexkit extension tests");

  test("Extension should be present", () => {
    const ext = getNexkitExtension();
    assert.ok(ext, `Expected extension with ID '${EXTENSION_ID}' to be present in the extension host.`);
  });

  test("Should activate extension", async () => {
    const ext = getNexkitExtension();
    assert.ok(ext);
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true);
  });

  test("Commands should be registered", async () => {
    // Commands are registered during activation.
    const ext = getNexkitExtension();
    assert.ok(ext);
    await ext.activate();

    const commands = await vscode.commands.getCommands(true);
    const nexkitCommands = [
      Commands.INIT_WORKSPACE,
      Commands.CHECK_EXTENSION_UPDATE,
      Commands.INSTALL_USER_MCPS,
      Commands.OPEN_SETTINGS,
      Commands.RESTORE_BACKUP,
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
});
