import * as assert from "assert";
import * as sinon from "sinon";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { SquadPresetMessageHandler } from "../../src/features/panel-ui/squadPresetMessageHandler";
import { ExtensionMessage } from "../../src/features/panel-ui/types/webviewMessages";
import {
  RejectedSquadPreset,
  SquadPreset,
  SquadPresetDiscovery,
  SquadPresetSourceKind,
  SquadResult,
  UnreachableSquadSource,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

function makePreset(id: string): SquadPreset {
  return {
    id,
    name: `Preset ${id}`,
    description: `Description ${id}`,
    source: {
      kind: SquadPresetSourceKind.Marketplace,
      pluginId: id,
      repository: "NexusInnovation/nexus-plugin-marketplace",
      squadFolderPath: `plugins/${id}/squad`,
    },
  };
}

function makeRejected(pluginId: string): RejectedSquadPreset {
  return {
    pluginId,
    source: {
      kind: SquadPresetSourceKind.Marketplace,
      pluginId,
      squadFolderPath: `plugins/${pluginId}/squad`,
    },
    diagnostics: [
      {
        code: "required-file-missing",
        severity: "error",
        message: "team.md is missing",
        remediation: "Add team.md to the preset.",
      },
    ],
  };
}

function makeUnreachable(sourceId: string): UnreachableSquadSource {
  return {
    sourceId,
    label: `Source ${sourceId}`,
    error: { code: "preset-fetch-failed", message: "unreachable", remediation: "retry" },
  };
}

function createServices(discover: sinon.SinonStub, initFromPreset?: sinon.SinonStub): ServiceContainer {
  return {
    logging: {
      warn: () => undefined,
      error: () => undefined,
      info: () => undefined,
    },
    squadPresets: {
      id: "composite",
      label: "All Squad preset sources",
      discoverPresets: discover,
    },
    squadInit: {
      initializeFromPreset: initFromPreset ?? sinon.stub(),
    },
  } as unknown as ServiceContainer;
}

suite("Unit: SquadPresetMessageHandler (SQD-019 preset picker host)", () => {
  let posted: ExtensionMessage[];
  let postMessage: (message: ExtensionMessage) => void;

  setup(() => {
    posted = [];
    postMessage = (message) => posted.push(message);
  });

  function commands(): string[] {
    return posted.map((m) => m.command);
  }

  function find<T extends ExtensionMessage["command"]>(command: T): Extract<ExtensionMessage, { command: T }> | undefined {
    return posted.find((m) => m.command === command) as Extract<ExtensionMessage, { command: T }> | undefined;
  }

  test("unknown command is not handled", async () => {
    const handler = new SquadPresetMessageHandler(createServices(sinon.stub()), postMessage);
    const handled = await handler.handle({ command: "webviewReady" });
    assert.strictEqual(handled, false);
    assert.strictEqual(posted.length, 0);
  });

  test("listSquadPresets toggles loading and posts the discovery", async () => {
    const discovery: SquadPresetDiscovery = {
      presets: [makePreset("alpha"), makePreset("beta")],
      rejected: [makeRejected("broken")],
      unreachable: [makeUnreachable("external-repos")],
    };
    const discover = sinon.stub().resolves(squadOk(discovery));
    const handler = new SquadPresetMessageHandler(createServices(discover), postMessage);

    const handled = await handler.handle({ command: "listSquadPresets" });

    assert.strictEqual(handled, true);
    assert.deepStrictEqual(commands(), ["squadPresetsLoading", "squadPresetsDiscovered", "squadPresetsLoading"]);
    assert.strictEqual((posted[0] as { isLoading: boolean }).isLoading, true);
    const discovered = find("squadPresetsDiscovered");
    assert.ok(discovered);
    assert.strictEqual(discovered.presets.length, 2);
    assert.strictEqual(discovered.rejected.length, 1);
    assert.strictEqual(discovered.unreachable.length, 1);
    assert.strictEqual((posted[2] as { isLoading: boolean }).isLoading, false);
  });

  test("listSquadPresets normalises a missing unreachable array to []", async () => {
    const discover = sinon.stub().resolves(squadOk({ presets: [], rejected: [] } as SquadPresetDiscovery));
    const handler = new SquadPresetMessageHandler(createServices(discover), postMessage);

    await handler.handle({ command: "listSquadPresets" });

    const discovered = find("squadPresetsDiscovered");
    assert.ok(discovered);
    assert.deepStrictEqual(discovered.unreachable, []);
  });

  test("listSquadPresets surfaces a source-level failure as squadPresetsError", async () => {
    const discover = sinon
      .stub()
      .resolves(
        squadErr({ code: "not-a-workspace", message: "Marketplace not installed", remediation: "Install it." }) as SquadResult<SquadPresetDiscovery>
      );
    const handler = new SquadPresetMessageHandler(createServices(discover), postMessage);

    await handler.handle({ command: "listSquadPresets" });

    assert.deepStrictEqual(commands(), ["squadPresetsLoading", "squadPresetsError", "squadPresetsLoading"]);
    const error = find("squadPresetsError");
    assert.ok(error);
    assert.strictEqual(error.error.code, "not-a-workspace");
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("listSquadPresets converts a thrown error into an actionable squadPresetsError", async () => {
    const discover = sinon.stub().rejects(new Error("boom"));
    const handler = new SquadPresetMessageHandler(createServices(discover), postMessage);

    await handler.handle({ command: "listSquadPresets" });

    const error = find("squadPresetsError");
    assert.ok(error);
    assert.strictEqual(error.error.code, "unknown");
    assert.ok(error.error.remediation && error.error.remediation.length > 0);
    assert.strictEqual(error.error.detail, "boom");
    assert.strictEqual((posted[posted.length - 1] as { isLoading: boolean }).isLoading, false);
  });

  test("initSquadFromPreset delegates to SquadInitService and reports success", async () => {
    const detection = { installed: true } as unknown as SquadResult<never>;
    const initFromPreset = sinon.stub().resolves(
      squadOk({ presetId: "alpha", detection, backupPath: null, writtenFileCount: 3 })
    );
    const handler = new SquadPresetMessageHandler(createServices(sinon.stub(), initFromPreset), postMessage);

    const handled = await handler.handle({ command: "initSquadFromPreset", presetId: "alpha" });

    assert.strictEqual(handled, true);
    assert.ok(initFromPreset.calledOnceWithExactly("alpha"));
    const result = find("squadInitResult");
    assert.ok(result);
    assert.strictEqual(result.presetId, "alpha");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.error, undefined);
    // A successful init re-emits the detection so the tab flips to the detected view.
    assert.ok(find("squadStatusUpdate"));
  });

  test("initSquadFromPreset does not emit squadStatusUpdate without detection", async () => {
    const initFromPreset = sinon.stub().resolves(
      squadOk({ presetId: "alpha", backupPath: null, writtenFileCount: 0 })
    );
    const handler = new SquadPresetMessageHandler(createServices(sinon.stub(), initFromPreset), postMessage);

    await handler.handle({ command: "initSquadFromPreset", presetId: "alpha" });

    assert.ok(find("squadInitResult"));
    assert.strictEqual(find("squadStatusUpdate"), undefined);
  });

  test("initSquadFromPreset surfaces a SquadInitService failure verbatim", async () => {
    const initFromPreset = sinon.stub().resolves(
      squadErr({ code: "cancelled", message: "Squad initialisation was cancelled.", remediation: "Try again." })
    );
    const handler = new SquadPresetMessageHandler(createServices(sinon.stub(), initFromPreset), postMessage);

    const handled = await handler.handle({ command: "initSquadFromPreset", presetId: "alpha" });

    assert.strictEqual(handled, true);
    const result = find("squadInitResult");
    assert.ok(result);
    assert.strictEqual(result.presetId, "alpha");
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
    assert.strictEqual(result.error.code, "cancelled");
    assert.strictEqual(find("squadStatusUpdate"), undefined);
  });

  test("initSquadFromPreset converts a thrown error into an actionable result", async () => {
    const initFromPreset = sinon.stub().rejects(new Error("kaboom"));
    const handler = new SquadPresetMessageHandler(createServices(sinon.stub(), initFromPreset), postMessage);

    await handler.handle({ command: "initSquadFromPreset", presetId: "alpha" });

    const result = find("squadInitResult");
    assert.ok(result);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
    assert.strictEqual(result.error.code, "unknown");
    assert.strictEqual(result.error.detail, "kaboom");
    assert.ok(result.error.remediation && result.error.remediation.length > 0);
  });
});
