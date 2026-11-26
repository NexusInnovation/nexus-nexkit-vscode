import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";
import { DevOpsMcpConfigService } from "../../src/features/apm-devops/devOpsMcpConfigService";
import { AZURE_DEVOPS_MCP_DOMAINS } from "../../src/features/apm-devops/models/devOpsConnection";

interface StoredConnection {
  id: string;
  organization: string;
  project: string;
}

suite("Unit: DevOpsMcpConfigService", () => {
  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;
  let service: DevOpsMcpConfigService;
  let tempDir: string;
  let configPath: string;
  let connections: StoredConnection[];
  let activeId: string | null;
  let executeCommand: sinon.SinonStub;
  let changed: sinon.SinonSpy;

  setup(async () => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-devops-mcp-"));
    configPath = path.join(tempDir, ".vscode", "mcp.json");
    connections = [
      { id: "org-first", organization: "org", project: "First" },
      { id: "org-second", organization: "org", project: "Second" },
    ];
    activeId = "org-first";
    sandbox.stub(SettingsManager, "getDevOpsConnectionsList").callsFake(() => connections);
    sandbox.stub(SettingsManager, "setDevOpsConnectionsList").callsFake(async (value) => {
      connections = value as StoredConnection[];
    });
    sandbox.stub(SettingsManager, "getActiveDevOpsConnection").callsFake(() => activeId);
    sandbox.stub(SettingsManager, "setActiveDevOpsConnection").callsFake(async (value) => {
      activeId = value;
    });
    executeCommand = sandbox.stub(vscode.commands, "executeCommand").resolves();
    service = new DevOpsMcpConfigService();
    sandbox.stub(service as any, "getWorkspaceMcpConfigPath").returns(configPath);
    changed = sandbox.spy();
    service.onConnectionsChanged(changed);
    await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
    await fs.promises.writeFile(
      configPath,
      JSON.stringify({ servers: { other: { command: "other-server" } }, inputs: [{ id: "existing" }] })
    );
  });

  teardown(() => {
    service.dispose();
    sandbox.restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function assertActivation(project: string): Promise<void> {
    const config = JSON.parse(await fs.promises.readFile(configPath, "utf8"));
    assert.deepStrictEqual(config.servers.other, { command: "other-server" });
    assert.deepStrictEqual(config.inputs, [{ id: "existing" }]);
    assert.deepStrictEqual(config.servers["azure-devops"], {
      command: "npx",
      args: ["-y", "@azure-devops/mcp", "org", project, "-d", ...AZURE_DEVOPS_MCP_DOMAINS],
      type: "stdio",
    });
    assert.ok(changed.calledOnce);
    await clock.tickAsync(1000);
    assert.ok(executeCommand.neverCalledWith("workbench.action.reloadWindow"));
  }

  test("Activates a selected project without reloading the window", async () => {
    await service.setActiveConnection("org-second");

    assert.strictEqual(activeId, "org-second");
    assert.strictEqual((await service.getActiveConnection())?.project, "Second");
    await assertActivation("Second");
  });

  test("Activates a newly added project without reloading the window", async () => {
    const added = await service.addConnection("https://dev.azure.com/org/Third");

    assert.strictEqual(added.id, "org-third");
    assert.strictEqual(activeId, "org-third");
    assert.strictEqual(connections.length, 3);
    await assertActivation("Third");
  });

  test("Activates a replacement after removing the active project without reloading", async () => {
    await service.removeConnection("org-first");

    assert.strictEqual(activeId, "org-second");
    assert.deepStrictEqual(
      connections.map((connection) => connection.id),
      ["org-second"]
    );
    await assertActivation("Second");
  });

  test("Does not update the active project or notify when writing the config fails", async () => {
    sandbox.stub(fs.promises, "writeFile").rejects(new Error("write failed"));

    await assert.rejects(service.setActiveConnection("org-second"), /write failed/);
    assert.strictEqual(activeId, "org-first");
    assert.ok(changed.notCalled);
    await clock.tickAsync(1000);
    assert.ok(executeCommand.neverCalledWith("workbench.action.reloadWindow"));
  });
});
