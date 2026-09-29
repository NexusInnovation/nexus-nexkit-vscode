import * as assert from "assert";
import * as sinon from "sinon";
import { squadErr, squadOk, SquadPluginStatus } from "../../src/features/squad/models";
import { SquadCliCommand } from "../../src/features/squad/services/squadCliService";
import { SquadPluginService } from "../../src/features/squad/services/squadPluginService";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

suite("Unit: SquadPluginService", () => {
  function createService(stdout: string): { service: SquadPluginService; execute: sinon.SinonStub } {
    const execute = sinon.stub().resolves(
      squadOk({
        command: SquadCliCommand.Plugin,
        exitCode: 0,
        stdout,
        stderr: "",
        durationMs: 1,
      })
    );
    const fileService = {
      readPluginMarketplaces: sinon.stub().resolves(squadOk([])),
    };
    const service = new SquadPluginService({
      fileService: fileService as never,
      cli: { execute } as never,
      logger: silentLogger,
    });
    return { service, execute };
  }

  test("readMarketplaces delegates to the read-only file layer", async () => {
    const fileService = {
      readPluginMarketplaces: sinon
        .stub()
        .resolves(squadOk([{ id: "core", source: "NexusInnovation/nexus-plugin-marketplace", kind: "github", enabled: true }])),
    };
    const service = new SquadPluginService({
      fileService: fileService as never,
      cli: { execute: sinon.stub() } as never,
      logger: silentLogger,
    });

    const result = await service.readMarketplaces();

    assert.strictEqual(result.ok, true);
    assert.ok(fileService.readPluginMarketplaces.calledOnce);
  });

  test("listInstalledPlugins invokes squad plugin list --json and normalizes output", async () => {
    const { service, execute } = createService(
      JSON.stringify({
        plugins: [
          {
            id: "team-plugin",
            displayName: "Team Plugin",
            marketplace: "core",
            enabled: true,
            version: "1.2.3",
            description: "Team tools",
          },
          { pluginId: "disabled-plugin", status: "disabled" },
          "legacy-plugin",
        ],
      })
    );

    const result = await service.listInstalledPlugins();

    assert.strictEqual(result.ok, true);
    sinon.assert.calledOnceWithMatch(execute, SquadCliCommand.Plugin, { args: ["list", "--json"] });
    if (result.ok) {
      assert.strictEqual(result.value.length, 3);
      assert.strictEqual(result.value[0].displayName, "Team Plugin");
      assert.strictEqual(result.value[0].marketplace, "core");
      assert.strictEqual(result.value[0].version, "1.2.3");
      assert.strictEqual(result.value[0].status, SquadPluginStatus.Enabled);
      assert.strictEqual(result.value[1].enabled, false);
      assert.strictEqual(result.value[1].status, SquadPluginStatus.Disabled);
      assert.strictEqual(result.value[2].id, "legacy-plugin");
      assert.strictEqual(result.value[2].status, SquadPluginStatus.Unknown);
    }
  });

  test("listInstalledPlugins returns plugin-list-failed when CLI JSON is invalid", async () => {
    const { service } = createService("not json");

    const result = await service.listInstalledPlugins();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "plugin-list-failed");
      assert.ok(result.error.remediation);
    }
  });

  test("listInstalledPlugins keeps cli-not-found actionable when the CLI is absent", async () => {
    const execute = sinon.stub().resolves(
      squadErr({
        code: "cli-not-found",
        message: "No CLI",
        remediation: "Install Squad CLI.",
      })
    );
    const service = new SquadPluginService({
      fileService: { readPluginMarketplaces: sinon.stub() } as never,
      cli: { execute } as never,
      logger: silentLogger,
    });

    const result = await service.listInstalledPlugins();

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "cli-not-found");
      assert.match(result.error.message, /could not be found/);
      assert.strictEqual(result.error.remediation, "Install Squad CLI.");
    }
  });
});
