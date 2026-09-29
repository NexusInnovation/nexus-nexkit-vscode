/**
 * AppStateContext — Squad message handling (SQD-007 / SQD-008).
 *
 * Exercises the centralized message handler in `AppStateProvider`: every Squad
 * message must land in the right slice, state transitions must be consistent
 * (loading toggles, errors clearing on success and never collapsing into a
 * silent success), and per-document flags (e.g. log truncation) must survive
 * the reducer untouched.
 */

import * as assert from "assert";
import { useAppState } from "../../../src/features/panel-ui/webview/hooks/useAppState";
import type { SquadState } from "../../../src/features/panel-ui/webview/types/squadState";
import { SquadLogKind } from "../../../src/features/panel-ui/webview/types/squadState";
import {
  renderWithProvider,
  act,
  cleanup,
  makeDetection,
  makeError,
  makePreset,
  makeRejectedPreset,
  makeUnreachableSource,
  makeDoctorReport,
} from "./harness/renderSquad";
import { dispatchExtensionMessage, resetVsCodeApiMock, postedMessagesOfCommand } from "./harness/vscodeApiMock";
import { SquadUpstreamRecommendationService } from "../../../src/features/squad/services/squadUpstreamRecommendationService";

function SquadProbe() {
  const { squad } = useAppState();
  return <pre data-testid="squad-json">{JSON.stringify(squad)}</pre>;
}

function renderProbe(): () => SquadState {
  const view = renderWithProvider(<SquadProbe />);
  return () => JSON.parse(view.getByTestId("squad-json").textContent ?? "{}") as SquadState;
}

function send(message: Record<string, unknown>): void {
  act(() => {
    dispatchExtensionMessage(message);
  });
}

function makeImportPreview(): Record<string, unknown> {
  return {
    previewId: "preview-1",
    source: { kind: "file", uri: "file:///workspace/squad-export.json" },
    sourceLabel: "squad-export.json",
    manifestVersion: "1.0",
    squadDirectory: ".squad",
    hasExistingSquad: true,
    agents: [{ name: "link", hasCharter: true, hasHistory: false, change: "overwrite" }],
    skills: [{ name: "code-review", change: "create" }],
    castingKeys: ["policy"],
    files: [{ relativePath: ".squad/team.md", change: "overwrite" }],
    warnings: ["Existing Squad files will be backed up first."],
    createdAt: 123,
  };
}

suite("AppStateContext — Squad messages", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  test("requests the initial state on mount", () => {
    renderProbe();
    assert.strictEqual(postedMessagesOfCommand("webviewReady").length, 1);
  });

  test("starts empty and not ready", () => {
    const squad = renderProbe();
    const state = squad();
    assert.strictEqual(state.isReady, false);
    assert.strictEqual(state.isLoading, false);
    assert.strictEqual(state.error, null);
    assert.strictEqual(state.detection, null);
  });

  test("squadStatusUpdate becomes ready, stores detection, and clears loading/error", () => {
    const squad = renderProbe();
    send({ command: "squadError", error: makeError() });
    send({ command: "squadLoading", isLoading: true });
    assert.strictEqual(squad().isLoading, true);
    assert.ok(squad().error);

    const detection = makeDetection();
    send({
      command: "squadStatusUpdate",
      detection,
      upstreams: [{ id: "up", kind: "local", reference: "../peer" }],
      marketplaces: [{ id: "market", source: "NexusInnovation/nexus-plugin-marketplace", kind: "github", enabled: true }],
      plugins: [{ id: "plug", enabled: true }],
    });

    const state = squad();
    assert.strictEqual(state.isReady, true);
    assert.strictEqual(state.isLoading, false, "status update must clear the in-flight flag");
    assert.strictEqual(state.error, null, "a successful status update must clear the previous error");
    assert.strictEqual(state.detection?.project.installState, detection.project.installState);
    assert.strictEqual(state.upstreams.length, 1);
    assert.strictEqual(state.marketplaces.length, 1);
    assert.strictEqual(state.plugins.length, 1);
    assert.strictEqual(state.upstreamRecommendations, null, "absent recommendations stay explicitly unevaluated");
  });

  test("squadStatusUpdate stores upstream recommendations and replaces them with null on a failed read", () => {
    const squad = renderProbe();
    const recommendations = new SquadUpstreamRecommendationService().recommend([
      { id: "nexus-org", kind: "git", reference: "https://github.com/acme/squad/tree/main/org" },
    ]);
    send({
      command: "squadStatusUpdate",
      detection: makeDetection(),
      upstreams: [],
      upstreamRecommendations: recommendations,
      plugins: [],
    });

    assert.deepStrictEqual(squad().upstreamRecommendations, recommendations);

    send({ command: "squadStatusUpdate", detection: makeDetection(), upstreams: [], upstreamRecommendations: null, plugins: [] });
    assert.strictEqual(squad().upstreamRecommendations, null);
  });

  test("squadPluginsUpdate stores marketplaces and plugins while clearing loading/error", () => {
    const squad = renderProbe();
    send({ command: "squadError", error: makeError() });
    send({ command: "squadLoading", isLoading: true });

    send({
      command: "squadPluginsUpdate",
      marketplaces: [{ id: "core", source: "NexusInnovation/nexus-plugin-marketplace", kind: "github", enabled: true }],
      plugins: [{ id: "greffondors", marketplace: "core", enabled: false, status: "disabled" }],
    });

    const state = squad();
    assert.strictEqual(state.isLoading, false);
    assert.strictEqual(state.error, null);
    assert.strictEqual(state.marketplaces[0].id, "core");
    assert.strictEqual(state.plugins[0].enabled, false);
  });

  test("squadProjectUpgraded clears the stale update check and loading/error (SQD-032)", () => {
    const squad = renderProbe();
    const detection = makeDetection();
    send({
      command: "squadUpdatesUpdate",
      updates: { detection, cli: {}, project: { updateAvailable: true }, checkedAt: 1 },
    });
    assert.ok(squad().updates);
    send({ command: "squadError", error: makeError() });
    send({ command: "squadLoading", isLoading: true });

    send({
      command: "squadProjectUpgraded",
      result: { upgraded: true, previousVersion: "1.0.0", targetVersion: "1.2.0", currentVersion: "1.2.0", backupCreated: true },
    });

    const state = squad();
    assert.strictEqual(state.updates, null, "a completed upgrade must invalidate the cached update check");
    assert.strictEqual(state.isLoading, false);
    assert.strictEqual(state.error, null);
  });

  test("squadPluginActionResult stores the latest plugin action outcome", () => {
    const squad = renderProbe();
    assert.strictEqual(squad().lastPluginAction, null);

    send({ command: "squadPluginActionResult", action: "dry-run", target: "./plugin", ok: true, changed: false, output: "plan" });
    assert.deepStrictEqual(squad().lastPluginAction, {
      action: "dry-run",
      target: "./plugin",
      ok: true,
      changed: false,
      output: "plan",
    });

    const error = makeError();
    send({ command: "squadPluginActionResult", action: "install", target: "./plugin", ok: false, error });
    const state = squad();
    assert.strictEqual(state.lastPluginAction?.ok, false);
    assert.strictEqual(state.lastPluginAction?.error?.code, error.code);
  });

  test("squadLoading toggles the in-flight flag both ways", () => {
    const squad = renderProbe();
    send({ command: "squadLoading", isLoading: true });
    assert.strictEqual(squad().isLoading, true);
    send({ command: "squadLoading", isLoading: false });
    assert.strictEqual(squad().isLoading, false);
  });

  test("squadError surfaces the structured error and clears loading (never a silent success)", () => {
    const squad = renderProbe();
    send({ command: "squadLoading", isLoading: true });
    const error = makeError({ code: "cli-timeout", message: "The Squad CLI timed out." });
    send({ command: "squadError", error });

    const state = squad();
    assert.strictEqual(state.isLoading, false);
    assert.deepStrictEqual(state.error, error);
  });

  test("squadCliUpgradeResult stores the verified upgrade and clears loading/error (SQD-031)", () => {
    const squad = renderProbe();
    assert.strictEqual(squad().cliUpgrade, null);
    send({ command: "squadError", error: makeError() });
    send({ command: "squadLoading", isLoading: true });
    const upgrade = {
      upgraded: true,
      previousVersion: "1.0.0",
      installedVersion: "1.2.0",
      latestVersion: "1.2.0",
      source: "global",
    };
    send({ command: "squadCliUpgradeResult", upgrade });

    const state = squad();
    assert.deepStrictEqual(state.cliUpgrade, upgrade);
    assert.strictEqual(state.isLoading, false);
    assert.strictEqual(state.error, null);
  });

  test("a failed CLI upgrade (squadError) never records an upgrade result", () => {
    const squad = renderProbe();
    send({ command: "squadError", error: makeError({ code: "upgrade-failed", message: "The Squad CLI upgrade failed." }) });

    const state = squad();
    assert.strictEqual(state.cliUpgrade, null);
    assert.strictEqual(state.error?.code, "upgrade-failed");
  });

  test("squadImportPreview stores the staged preview and clears loading/error", () => {
    const squad = renderProbe();
    const preview = makeImportPreview();
    send({ command: "squadError", error: makeError({ code: "parse-failed" }) });
    send({ command: "squadLoading", isLoading: true });

    send({ command: "squadImportPreview", preview });

    const state = squad();
    assert.strictEqual(state.isLoading, false);
    assert.strictEqual(state.error, null);
    assert.deepStrictEqual(state.importPreview, preview);
    assert.strictEqual(state.lastImport, null);
  });

  test("squadImportResult stores the outcome and clears the staged preview", () => {
    const squad = renderProbe();
    const preview = makeImportPreview();
    send({ command: "squadImportPreview", preview });

    const outcome = {
      previewId: "preview-1",
      source: preview.source,
      importedAt: 456,
      agentCount: 1,
      skillCount: 1,
      backupCreated: true,
      stdout: "ok",
      stderr: "",
      durationMs: 25,
    };
    send({ command: "squadImportResult", import: outcome });

    const state = squad();
    assert.strictEqual(state.importPreview, null);
    assert.deepStrictEqual(state.lastImport, outcome);
    assert.strictEqual(state.error, null);
    assert.strictEqual(state.isLoading, false);
  });

  test("squadImportPreviewDiscarded clears only the staged import preview", () => {
    const squad = renderProbe();
    send({ command: "squadImportPreview", preview: makeImportPreview() });
    assert.ok(squad().importPreview);

    send({ command: "squadImportPreviewDiscarded" });

    assert.strictEqual(squad().importPreview, null);
  });

  test("squadRosterUpdate stores roster and charters", () => {
    const squad = renderProbe();
    send({
      command: "squadRosterUpdate",
      roster: [{ id: "trinity", name: "Trinity", role: "QA", hasCharter: true }],
      charters: [{ agentId: "trinity", relativePath: ".squad/agents/trinity/charter.md", content: "# Charter" }],
    });

    const state = squad();
    assert.strictEqual(state.roster.length, 1);
    assert.strictEqual(state.roster[0].id, "trinity");
    assert.strictEqual(state.charters[0].agentId, "trinity");
  });

  test("squadDocsUpdate stores decisions and routing documents", () => {
    const squad = renderProbe();
    send({
      command: "squadDocsUpdate",
      decisions: { kind: "decisions", relativePath: ".squad/decisions.md", exists: true, content: "# Decisions" },
      routing: null,
    });

    const state = squad();
    assert.strictEqual(state.decisions?.exists, true);
    assert.strictEqual(state.routing, null);
  });

  test("squadModelConfigUpdate stores the model config document (including invalid raw content)", () => {
    const squad = renderProbe();
    assert.strictEqual(squad().modelConfig, null);

    send({
      command: "squadModelConfigUpdate",
      modelConfig: { relativePath: ".squad/model-config.json", exists: true, content: "{", config: null },
    });

    const state = squad();
    assert.strictEqual(state.modelConfig?.content, "{");
    assert.strictEqual(state.modelConfig?.config, null);
  });

  test("squadModelConfigSaved replaces the document and clears loading/error", () => {
    const squad = renderProbe();
    send({ command: "squadError", error: makeError({ code: "parse-failed" }) });
    send({ command: "squadLoading", isLoading: true });

    const config = { defaultModel: "gpt-5.6-terra", overrides: [{ agentId: "neo", model: "gpt-5.6-sol" }] };
    send({
      command: "squadModelConfigSaved",
      modelConfig: { relativePath: ".squad/model-config.json", exists: true, content: "{}", config },
      result: { relativePath: ".squad/model-config.json", created: false, backupCreated: true, bytesWritten: 2 },
    });

    const state = squad();
    assert.strictEqual(state.isLoading, false);
    assert.strictEqual(state.error, null);
    assert.deepStrictEqual(state.modelConfig?.config, config);
  });

  test("a failed model config save keeps the previous document and surfaces the error", () => {
    const squad = renderProbe();
    const previous = { relativePath: ".squad/model-config.json", exists: true, content: "{}", config: { overrides: [] } };
    send({ command: "squadModelConfigUpdate", modelConfig: previous });
    send({ command: "squadLoading", isLoading: true });

    send({ command: "squadError", error: makeError({ code: "parse-failed", message: "invalid" }) });

    const state = squad();
    assert.deepStrictEqual(state.modelConfig, previous);
    assert.strictEqual(state.error?.code, "parse-failed");
    assert.strictEqual(state.isLoading, false);
  });

  test("squadLogsUpdate preserves the per-document truncation flag and size", () => {
    const squad = renderProbe();
    send({
      command: "squadLogsUpdate",
      logs: [
        {
          kind: SquadLogKind.Log,
          relativePath: ".squad/logs/big.md",
          content: "partial",
          truncated: true,
          sizeBytes: 262144,
        },
        {
          kind: SquadLogKind.AgentHistory,
          agentId: "trinity",
          relativePath: ".squad/agents/trinity/history.md",
          content: "full",
        },
      ],
    });

    const state = squad();
    assert.strictEqual(state.logs.length, 2);
    assert.strictEqual(state.logs[0].truncated, true, "truncation flag must survive the reducer");
    assert.strictEqual(state.logs[0].sizeBytes, 262144);
    assert.strictEqual(state.logs[1].truncated, undefined, "a non-truncated log must not gain a truncation flag");
  });

  test("squadDoctorUpdate stores the report and clears loading", () => {
    const squad = renderProbe();
    send({ command: "squadLoading", isLoading: true });
    const doctor = makeDoctorReport();
    send({ command: "squadDoctorUpdate", doctor });

    const state = squad();
    assert.strictEqual(state.doctor?.overall, doctor.overall);
    assert.strictEqual(state.isLoading, false);
  });

  test("squadPresetsDiscovered fills the picker slice and marks it loaded", () => {
    const squad = renderProbe();
    send({ command: "squadPresetsLoading", isLoading: true });
    assert.strictEqual(squad().presetPicker.loading, true);

    send({
      command: "squadPresetsDiscovered",
      presets: [makePreset("alpha")],
      rejected: [makeRejectedPreset("broken")],
      unreachable: [makeUnreachableSource("private-repo")],
    });

    const picker = squad().presetPicker;
    assert.strictEqual(picker.loading, false);
    assert.strictEqual(picker.loaded, true);
    assert.strictEqual(picker.error, null);
    assert.strictEqual(picker.presets.length, 1);
    assert.strictEqual(picker.rejected.length, 1);
    assert.strictEqual(picker.unreachable.length, 1);
  });

  test("squadPresetsError marks the picker loaded with an error (not an empty success)", () => {
    const squad = renderProbe();
    send({ command: "squadPresetsLoading", isLoading: true });
    const error = makeError({ code: "preset-fetch-failed", message: "Discovery failed." });
    send({ command: "squadPresetsError", error });

    const picker = squad().presetPicker;
    assert.strictEqual(picker.loading, false);
    assert.strictEqual(picker.loaded, true);
    assert.deepStrictEqual(picker.error, error);
  });

  test("squadInitResult records the init error against its preset id", () => {
    const squad = renderProbe();
    const error = makeError({ code: "preset-invalid", message: "Init is not available yet." });
    send({ command: "squadInitResult", presetId: "alpha", ok: false, error });

    const picker = squad().presetPicker;
    assert.strictEqual(picker.initResultPresetId, "alpha");
    assert.deepStrictEqual(picker.initError, error);
  });

  test("squadInitResult with ok clears the init error", () => {
    const squad = renderProbe();
    send({ command: "squadInitResult", presetId: "alpha", ok: true });
    const picker = squad().presetPicker;
    assert.strictEqual(picker.initResultPresetId, "alpha");
    assert.strictEqual(picker.initError, null);
  });

  test("squadUpstreamOperationStarted marks the upstream operation as running", () => {
    const squad = renderProbe();
    assert.strictEqual(squad().upstreamOperation, null);
    send({ command: "squadUpstreamOperationStarted", operation: "sync", name: "org" });
    assert.deepStrictEqual(squad().upstreamOperation, { operation: "sync", name: "org", status: "running", error: null });
  });

  test("squadUpstreamOperationResult stores upstreams and a success status", () => {
    const squad = renderProbe();
    const upstreams = [{ id: "org", kind: "git", reference: "org/org" }];
    send({ command: "squadUpstreamOperationResult", operation: "add", name: "org", ok: true, upstreams });
    const state = squad();
    assert.deepStrictEqual(state.upstreams, upstreams);
    assert.strictEqual(state.upstreamOperation?.status, "succeeded");
    assert.strictEqual(state.upstreamOperation?.error, null);
  });

  test("a failed squadUpstreamOperationResult keeps the error visible (never a success)", () => {
    const squad = renderProbe();
    const error = makeError({ code: "upstream-failed", message: "Some upstreams failed to sync." });
    send({ command: "squadUpstreamOperationResult", operation: "sync", ok: false, upstreams: [], error });
    const op = squad().upstreamOperation;
    assert.strictEqual(op?.status, "failed");
    assert.deepStrictEqual(op?.error, error);
  });
});
