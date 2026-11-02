import * as assert from "assert";
import * as sinon from "sinon";
import { SettingsManager } from "../../src/core/settingsManager";
import { MarketplaceService } from "../../src/features/marketplace-management/marketplaceService";
import { NEXUS_PLUGIN_MARKETPLACE } from "../../src/features/marketplace-management/models/marketplace";

suite("Unit: MarketplaceService", () => {
  let sandbox: sinon.SinonSandbox;
  let service: MarketplaceService;
  let stored: string[];
  let setStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    stored = [];
    sandbox.stub(SettingsManager, "getPluginMarketplaces").callsFake(() => [...stored]);
    setStub = sandbox.stub(SettingsManager, "setPluginMarketplaces").callsFake(async (value: string[]) => {
      stored = [...value];
    });
    service = new MarketplaceService();
  });

  teardown(() => {
    service.dispose();
    sandbox.restore();
  });

  suite("normalizeSource", () => {
    test("accepts GitHub shorthand with an optional ref", () => {
      assert.strictEqual(MarketplaceService.normalizeSource(" owner/repo "), "owner/repo");
      assert.strictEqual(MarketplaceService.normalizeSource("owner/repo#develop"), "owner/repo#develop");
    });

    test("converts GitHub URLs to shorthand", () => {
      assert.strictEqual(MarketplaceService.normalizeSource("https://github.com/owner/repo.git"), "owner/repo");
      assert.strictEqual(MarketplaceService.normalizeSource("https://github.com/owner/repo/"), "owner/repo");
    });

    test("keeps other git URLs and rejects invalid input", () => {
      assert.strictEqual(MarketplaceService.normalizeSource("git@host.com:org/repo.git"), "git@host.com:org/repo.git");
      assert.strictEqual(MarketplaceService.normalizeSource(""), undefined);
      assert.strictEqual(MarketplaceService.normalizeSource("not a repo"), undefined);
    });
  });

  suite("add", () => {
    test("rejects invalid sources without writing settings", async () => {
      await assert.rejects(() => service.add("nope"), /owner\/repo/);
      assert.ok(setStub.notCalled);
    });

    test("ignores duplicates regardless of case or #ref", async () => {
      stored = ["Owner/Repo"];

      await service.add("owner/repo#main");

      assert.ok(setStub.notCalled);
    });

    test("keeps the Nexus marketplace first", async () => {
      stored = ["other/market"];

      const updated = await service.add(NEXUS_PLUGIN_MARKETPLACE);

      assert.deepStrictEqual(updated, [NEXUS_PLUGIN_MARKETPLACE, "other/market"]);
    });

    test("appends other marketplaces", async () => {
      stored = [NEXUS_PLUGIN_MARKETPLACE];

      const updated = await service.add("other/market");

      assert.deepStrictEqual(updated, [NEXUS_PLUGIN_MARKETPLACE, "other/market"]);
    });
  });

  suite("remove", () => {
    test("removes the matching entry only", async () => {
      stored = [NEXUS_PLUGIN_MARKETPLACE, "other/market#dev"];

      const updated = await service.remove("other/market");

      assert.deepStrictEqual(updated, [NEXUS_PLUGIN_MARKETPLACE]);
    });

    test("does not write settings when nothing matches", async () => {
      stored = [NEXUS_PLUGIN_MARKETPLACE];

      await service.remove("unknown/repo");

      assert.ok(setStub.notCalled);
    });
  });

  test("getSuggestions flags already configured marketplaces", () => {
    stored = [`${NEXUS_PLUGIN_MARKETPLACE}#main`];

    const suggestions = service.getSuggestions();

    assert.strictEqual(suggestions.find((s) => s.isNexus)?.isConfigured, true);
    assert.ok(suggestions.filter((s) => !s.isNexus).every((s) => !s.isConfigured));
  });
});
