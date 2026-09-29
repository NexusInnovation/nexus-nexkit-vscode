/**
 * Squad upstreams + plugins UI (SQD-040).
 *
 * Covers FR-031/032 upstream actions, FR-042/043 inventory display, and
 * FR-044 plugin lifecycle actions. The host owns confirmations/backups; these
 * tests verify the webview renders those affordances, posts the correct
 * message contracts, and keeps failures visible/actionable.
 */

import * as assert from "assert";
import { SquadOperationFeedbackView } from "../../../src/features/panel-ui/webview/components/molecules/SquadOperationFeedback";
import { SquadPluginsSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadPluginsSection";
import { SquadUpstreamSection } from "../../../src/features/panel-ui/webview/components/organisms/SquadUpstreamSection";
import {
  SquadMarketplaceKind,
  SquadPluginAction,
  SquadPluginStatus,
  SquadUpstreamKind,
  SquadUpstreamOperation,
} from "../../../src/features/squad/models";
import { render, renderWithAppState, fireEvent, cleanup, makeError } from "./harness/renderSquad";
import { lastPostedMessage, resetVsCodeApiMock } from "./harness/vscodeApiMock";

function inputValue(view: ReturnType<typeof renderWithAppState>, label: string, value: string): void {
  fireEvent.input(view.getByLabelText(label), { target: { value } });
}

suite("Squad upstreams/plugins UI (SQD-040)", () => {
  teardown(() => {
    cleanup();
    resetVsCodeApiMock();
  });

  suite("SquadUpstreamSection", () => {
    test("renders upstream controls and posts list/sync/remove/add commands", () => {
      const view = renderWithAppState(<SquadUpstreamSection />, {
        isReady: true,
        upstreams: [
          {
            id: "org",
            kind: SquadUpstreamKind.Git,
            reference: "https://github.com/acme/org-squad.git",
            gitRef: "main",
          },
        ],
      });

      assert.ok(view.getByText("Sync all"));
      assert.ok(view.getByText("Refresh list"));
      assert.ok(view.getByText("org"));
      assert.ok(view.getByText("Git"));
      assert.ok(view.container.textContent?.includes("@ main"));

      fireEvent.click(view.getByText("Sync all").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), { command: "syncSquadUpstream", name: undefined });

      fireEvent.click(view.getByText("Refresh list").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), { command: "listSquadUpstreams" });

      fireEvent.click(view.getByLabelText("Sync upstream org"));
      assert.deepStrictEqual(lastPostedMessage(), { command: "syncSquadUpstream", name: "org" });

      fireEvent.click(view.getByLabelText("Remove upstream org"));
      assert.deepStrictEqual(lastPostedMessage(), { command: "removeSquadUpstream", name: "org" });

      inputValue(view, "Upstream source", " ../team-squad ");
      inputValue(view, "Upstream name", " team ");
      inputValue(view, "Upstream git ref", " develop ");
      fireEvent.click(view.getByText("Add upstream").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "addSquadUpstream",
        source: "../team-squad",
        name: "team",
        ref: "develop",
      });
    });

    test("keeps failed upstream operations actionable with retry and no success state", () => {
      const view = renderWithAppState(<SquadUpstreamSection />, {
        isReady: true,
        upstreams: [{ id: "org", kind: SquadUpstreamKind.Local, reference: "../org" }],
        upstreamOperation: {
          operation: SquadUpstreamOperation.Sync,
          name: "org",
          status: "failed",
          error: makeError({
            code: "upstream-failed",
            message: "Some upstreams failed to sync.",
            remediation: "Fix the upstream source and try again.",
          }),
        },
      });

      assert.ok(view.getByText('Syncing upstream "org" failed.'));
      assert.ok(view.getByText("Some upstreams failed to sync."));
      assert.strictEqual(view.queryByText('Upstream "org" synced.'), null);

      fireEvent.click(view.getByText("Retry").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), { command: "syncSquadUpstream", name: "org" });
    });
  });

  suite("SquadPluginsSection", () => {
    test("renders marketplace and plugin inventory with lifecycle actions", () => {
      const view = renderWithAppState(<SquadPluginsSection />, {
        isReady: true,
        marketplaces: [
          {
            id: "nexus",
            displayName: "Nexus Marketplace",
            source: "NexusInnovation/nexus-plugin-marketplace",
            kind: SquadMarketplaceKind.GitHub,
            enabled: true,
            ref: "main",
          },
        ],
        plugins: [
          {
            id: "quality-playbook",
            displayName: "Quality Playbook",
            marketplace: "nexus",
            enabled: true,
            status: SquadPluginStatus.Enabled,
            version: "1.0.0",
            description: "Quality checks",
          },
        ],
      });

      assert.ok(view.getByText("Nexus Marketplace"));
      assert.ok(view.getByText("GitHub"));
      assert.ok(view.container.textContent?.includes("@ main"));
      assert.ok(view.getByText("Quality Playbook"));
      assert.ok(view.getByText("v1.0.0"));
      assert.ok(view.getByText("Quality checks"));
      assert.strictEqual(
        view.queryByText("Register the Nexus marketplace"),
        null,
        "the Nexus registration shortcut is hidden when already registered"
      );

      fireEvent.click(view.getByText("Disable").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "runSquadPluginAction",
        action: SquadPluginAction.Disable,
        target: "quality-playbook",
      });

      const uninstall = view.getByText("Uninstall").closest("button")!;
      assert.ok(uninstall.getAttribute("title")?.includes("asks for confirmation"));
      assert.ok(uninstall.getAttribute("title")?.includes("backs up .squad/"));
    });

    test("posts marketplace registration and local plugin validate/dry-run/install actions", () => {
      const view = renderWithAppState(<SquadPluginsSection />, { isReady: true, marketplaces: [], plugins: [] });

      assert.ok(view.getByText("Register the Nexus marketplace"));
      fireEvent.click(view.getByText("Register the Nexus marketplace").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "runSquadPluginAction",
        action: SquadPluginAction.AddNexusMarketplace,
        target: undefined,
      });

      inputValue(view, "Marketplace repository", " acme/squad-marketplace ");
      fireEvent.click(view.getByLabelText("Register marketplace"));
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "runSquadPluginAction",
        action: SquadPluginAction.AddMarketplace,
        target: "acme/squad-marketplace",
      });

      inputValue(view, "Local plugin folder", " ./plugins/quality ");
      fireEvent.click(view.getByText("Validate").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "runSquadPluginAction",
        action: SquadPluginAction.Validate,
        target: "./plugins/quality",
      });

      fireEvent.click(view.getByText("Dry-run").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "runSquadPluginAction",
        action: SquadPluginAction.DryRun,
        target: "./plugins/quality",
      });

      fireEvent.click(view.getByText("Install").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "runSquadPluginAction",
        action: SquadPluginAction.Install,
        target: "./plugins/quality",
      });
    });

    test("keeps plugin failures visible/actionable and separates successful CLI output", () => {
      const failure = renderWithAppState(<SquadPluginsSection />, {
        isReady: true,
        marketplaces: [],
        plugins: [],
        lastPluginAction: {
          action: SquadPluginAction.Install,
          target: "./plugins/broken",
          ok: false,
          error: makeError({
            code: "plugin-action-failed",
            message: "Plugin install failed.",
            remediation: "Validate the plugin folder and try again.",
          }),
        },
      });

      assert.ok(failure.getByText("Install plugin (./plugins/broken) failed."));
      assert.ok(failure.getByText("Plugin install failed."));
      assert.strictEqual(failure.queryByText("Install plugin (./plugins/broken) completed."), null);
      fireEvent.click(failure.getByText("Retry").closest("button")!);
      assert.deepStrictEqual(lastPostedMessage(), {
        command: "runSquadPluginAction",
        action: SquadPluginAction.Install,
        target: "./plugins/broken",
      });
      cleanup();
      resetVsCodeApiMock();

      const success = renderWithAppState(<SquadPluginsSection />, {
        isReady: true,
        marketplaces: [],
        plugins: [],
        lastPluginAction: {
          action: SquadPluginAction.DryRun,
          target: "./plugins/ok",
          ok: true,
          changed: false,
          output: "Would install 2 files.",
        },
      });

      assert.ok(success.getByText("Dry-run plugin install (./plugins/ok) completed. No changes were made."));
      assert.ok(success.getByText("Would install 2 files."));
    });
  });

  test("renders cancelled operation feedback as neutral status, not an error alert", () => {
    const view = render(
      <SquadOperationFeedbackView
        feedback={{
          tone: "cancelled",
          message: "The plugin action was cancelled.",
          error: makeError({
            code: "cancelled",
            message: "The plugin action was cancelled.",
            remediation: "Run it again when ready.",
          }),
        }}
      />
    );

    assert.ok(view.getByText("The plugin action was cancelled."));
    assert.strictEqual(view.container.querySelector('[role="alert"]'), null);
    assert.strictEqual(view.container.querySelector('[role="status"]')?.textContent?.includes("cancelled"), true);
  });
});
