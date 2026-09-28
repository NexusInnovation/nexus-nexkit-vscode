/**
 * Tests for SquadUpstreamRecommendationService (SQD-037, FR-033/FR-034/FR-035):
 * org → team → project ordering, level classification, the preconfigured
 * Nexus marketplace suggestion and the `squad upstream` sub-path / full-clone
 * warnings.
 */

import * as assert from "assert";
import {
  NEXUS_UPSTREAM_MARKETPLACE_REPOSITORY,
  SquadUpstreamRecommendationService,
} from "../../src/features/squad/services/squadUpstreamRecommendationService";
import {
  SquadUpstreamKind,
  SquadUpstreamLevel,
  SquadUpstreamLevelStatus,
  SquadUpstreamSource,
  SquadUpstreamWarningCode,
  SquadUpstreamWarningSeverity,
} from "../../src/features/squad/models";

function source(id: string, reference: string, kind: SquadUpstreamSource["kind"] = SquadUpstreamKind.Local): SquadUpstreamSource {
  return { id, kind, reference };
}

function codes(warnings: { code: string }[]): string[] {
  return warnings.map((warning) => warning.code);
}

suite("Unit: SquadUpstreamRecommendationService", () => {
  const service = new SquadUpstreamRecommendationService();

  suite("hierarchy (FR-033)", () => {
    test("always returns org, team, project in order with 1-based positions", () => {
      const result = service.recommend([]);

      assert.deepStrictEqual(
        result.levels.map((level) => [level.level, level.position]),
        [
          [SquadUpstreamLevel.Org, 1],
          [SquadUpstreamLevel.Team, 2],
          [SquadUpstreamLevel.Project, 3],
        ]
      );
      assert.ok(result.levels.every((level) => level.status === SquadUpstreamLevelStatus.Missing));
      assert.deepStrictEqual(result.unclassifiedSourceIds, []);
    });

    test("keeps the org → team → project order regardless of manifest order", () => {
      const result = service.recommend([
        source("billing-project", "../billing"),
        source("nexus-org", "../org"),
        source("platform-team", "../platform"),
      ]);

      assert.deepStrictEqual(
        result.levels.map((level) => level.level),
        [SquadUpstreamLevel.Org, SquadUpstreamLevel.Team, SquadUpstreamLevel.Project]
      );
      assert.deepStrictEqual(
        result.levels.map((level) => level.sourceIds),
        [["nexus-org"], ["platform-team"], ["billing-project"]]
      );
      assert.ok(result.levels.every((level) => level.status === SquadUpstreamLevelStatus.Configured));
    });

    test("warns for each source listed after a more specific level", () => {
      const result = service.recommend([
        source("billing-project", "../billing"),
        source("nexus-org", "../org"),
        source("platform-team", "../platform"),
      ]);

      const order = result.warnings.filter((warning) => warning.code === SquadUpstreamWarningCode.HierarchyOrder);
      assert.deepStrictEqual(
        order.map((warning) => warning.sourceId),
        ["nexus-org", "platform-team"]
      );
      assert.ok(order.every((warning) => warning.severity === SquadUpstreamWarningSeverity.Warning));
      assert.ok(order[0].remediation.includes(".squad/upstream.json"));
    });

    test("does not warn when sources follow the recommended order", () => {
      const result = service.recommend([
        source("nexus-org", "../org"),
        source("org-extras", "../org-extras"),
        source("platform-team", "../platform"),
        source("billing-project", "../billing"),
      ]);

      assert.deepStrictEqual(result.warnings, [], "all levels configured and ordered → no warnings");
      assert.deepStrictEqual(result.levels[0].sourceIds, ["nexus-org", "org-extras"]);
    });

    test("allows skipped levels without an order warning", () => {
      const result = service.recommend([source("nexus-org", "../org"), source("billing-project", "../billing")]);
      assert.ok(!codes(result.warnings).includes(SquadUpstreamWarningCode.HierarchyOrder));
      assert.strictEqual(result.levels[1].status, SquadUpstreamLevelStatus.Missing);
    });
  });

  suite("level classification", () => {
    test("classifies by id keywords (English and French)", () => {
      assert.strictEqual(service.classifyLevel(source("acme-organization", "x")), SquadUpstreamLevel.Org);
      assert.strictEqual(service.classifyLevel(source("equipe-data", "x")), SquadUpstreamLevel.Team);
      assert.strictEqual(service.classifyLevel(source("projet-alpha", "x")), SquadUpstreamLevel.Project);
    });

    test("falls back to the reference when the id is not descriptive", () => {
      assert.strictEqual(service.classifyLevel(source("base", "../shared/org-squad")), SquadUpstreamLevel.Org);
      assert.strictEqual(
        service.classifyLevel(source("upstream-1", "https://github.com/acme/team-platform.git", SquadUpstreamKind.Git)),
        SquadUpstreamLevel.Team
      );
    });

    test("leaves ambiguous and free sources unclassified", () => {
      assert.strictEqual(service.classifyLevel(source("org-team", "x")), undefined);
      assert.strictEqual(service.classifyLevel(source("shared-tools", "../tools")), undefined);

      const result = service.recommend([source("shared-tools", "../tools"), source("nexus-org", "../org")]);
      assert.deepStrictEqual(result.unclassifiedSourceIds, ["shared-tools"]);
    });

    test("does not match keywords embedded in longer words", () => {
      assert.strictEqual(service.classifyLevel(source("myorg", "../x")), undefined);
      assert.strictEqual(service.classifyLevel(source("teamwork", "../x")), undefined);
    });
  });

  suite("preconfigured Nexus source (FR-034)", () => {
    test("suggests the Nexus marketplace with a reserved folder per level", () => {
      const result = service.recommend([]);

      for (const level of result.levels) {
        assert.strictEqual(level.suggestion.repository, NEXUS_UPSTREAM_MARKETPLACE_REPOSITORY);
        assert.strictEqual(level.suggestion.url, "https://github.com/NexusInnovation/nexus-plugin-marketplace.git");
        assert.strictEqual(level.suggestion.reservedFolder, `squad/upstreams/${level.level}`);
        assert.strictEqual(level.suggestion.recommendedKind, SquadUpstreamKind.Export);
        assert.strictEqual(level.suggestion.subpathSupported, false);
      }
    });

    test("honours a custom repository and reserved folder root", () => {
      const custom = new SquadUpstreamRecommendationService({
        marketplaceRepository: "acme/squad-hub",
        reservedFolderRoot: "levels/",
      });
      const result = custom.recommend([]);

      assert.strictEqual(result.levels[0].suggestion.repository, "acme/squad-hub");
      assert.strictEqual(result.levels[0].suggestion.reservedFolder, "levels/org");
      assert.ok(result.warnings[0].message.includes("acme/squad-hub"));
    });

    test("flags that reserved folders cannot be targeted while a level is missing", () => {
      const result = service.recommend([]);

      assert.deepStrictEqual(codes(result.warnings), [SquadUpstreamWarningCode.ReservedFolderLimitation]);
      const notice = result.warnings[0];
      assert.strictEqual(notice.severity, SquadUpstreamWarningSeverity.Info);
      assert.ok(notice.message.includes("squad/upstreams/org"));
      assert.ok(notice.message.includes("clones the full git repository"));
      assert.ok(notice.remediation.includes("JSON export"));
      assert.ok(notice.alternatives?.some((alternative) => alternative.includes("dedicated upstream repository")));
    });
  });

  suite("sub-path detection (FR-035)", () => {
    const withSubpath: [string, string][] = [
      ["https://github.com/NexusInnovation/nexus-plugin-marketplace/tree/main/squad/upstreams/org", "squad/upstreams/org"],
      ["https://github.com/acme/squad/blob/main/team/README.md", "team/README.md"],
      ["https://github.com/acme/squad.git/org", "org"],
      ["https://github.com/acme/squad//org/", "org"],
      ["https://github.com/acme/squad/org", "org"],
      ["git@github.com:acme/squad.git/team", "team"],
      ["git@github.com:acme/squad/team", "team"],
      ["acme/squad/project", "project"],
      ["https://dev.azure.com/acme/proj/_git/squad?path=/org", "org"],
      ["https://gitlab.com/group/sub/repo/-/tree/main/org", "org"],
      ["https://bitbucket.org/acme/squad/src/main/org", "org"],
      ["https://github.com/acme/squad.git#main:org", "org"],
      ["https://github.com/acme/squad.git#path=team", "team"],
    ];
    for (const [reference, expected] of withSubpath) {
      test(`detects "${expected}" in ${reference}`, () => {
        assert.strictEqual(service.detectSubpath(reference), expected);
      });
    }

    const repositoryRoots = [
      "https://github.com/acme/squad.git",
      "https://github.com/acme/squad",
      "https://github.com/acme/squad/",
      "https://github.com/acme/squad/tree/main",
      "git@github.com:acme/squad.git",
      "https://gitlab.com/group/sub/repo.git",
      "https://dev.azure.com/acme/proj/_git/squad",
      "acme/squad",
      "https://github.com/acme/squad.git#main",
      "not a url",
    ];
    for (const reference of repositoryRoots) {
      test(`treats ${reference} as a repository root`, () => {
        assert.strictEqual(service.detectSubpath(reference), undefined);
      });
    }
  });

  suite("sub-path and full-clone warnings (FR-035)", () => {
    test("warns that a git sub-path is ignored and proposes alternatives", () => {
      const result = service.recommend([
        source(
          "nexus-org",
          "https://github.com/NexusInnovation/nexus-plugin-marketplace/tree/main/squad/upstreams/org",
          SquadUpstreamKind.Git
        ),
      ]);

      const subpath = result.warnings.filter((warning) => warning.code === SquadUpstreamWarningCode.SubpathUnsupported);
      assert.strictEqual(subpath.length, 1);
      const warning = subpath[0];
      assert.strictEqual(warning.sourceId, "nexus-org");
      assert.strictEqual(warning.severity, SquadUpstreamWarningSeverity.Warning);
      assert.ok(warning.message.includes("squad/upstreams/org"));
      assert.ok(warning.message.includes("clones the whole git repository"));
      assert.ok(warning.remediation.length > 0);
      assert.deepStrictEqual(warning.alternatives, [
        "Create a dedicated upstream repository per level (org, team, project).",
        "Generate a JSON export from the sub-folder and add it as an 'export' upstream source.",
      ]);
      assert.ok(
        !codes(result.warnings).includes(SquadUpstreamWarningCode.FullClone),
        "a sub-path warning already explains the full clone"
      );
    });

    test("warns when the whole Nexus marketplace is used as a git upstream", () => {
      for (const reference of [
        "https://github.com/NexusInnovation/nexus-plugin-marketplace.git",
        "git@github.com:nexusinnovation/nexus-plugin-marketplace.git",
        "NexusInnovation/nexus-plugin-marketplace",
      ]) {
        const result = service.recommend([source("nexus", reference, SquadUpstreamKind.Git)]);
        const fullClone = result.warnings.filter((warning) => warning.code === SquadUpstreamWarningCode.FullClone);
        assert.strictEqual(fullClone.length, 1, reference);
        assert.strictEqual(fullClone[0].sourceId, "nexus");
        assert.ok(fullClone[0].remediation.includes("squad/upstreams/"));
      }
    });

    test("does not raise sub-path warnings for local or export sources", () => {
      const result = service.recommend([
        source("nexus-org", "../marketplace/squad/upstreams/org", SquadUpstreamKind.Local),
        source("platform-team", "https://example.com/exports/team/squad-export.json", SquadUpstreamKind.Export),
        source("billing-project", "https://github.com/acme/billing-squad.git", SquadUpstreamKind.Git),
      ]);

      assert.deepStrictEqual(result.warnings, []);
    });

    test("orders warnings: per-source first, then hierarchy, then the reserved-folder notice", () => {
      const result = service.recommend([
        source("platform-team", "https://github.com/acme/squad/tree/main/team", SquadUpstreamKind.Git),
        source("nexus-org", "../org"),
      ]);

      assert.deepStrictEqual(codes(result.warnings), [
        SquadUpstreamWarningCode.SubpathUnsupported,
        SquadUpstreamWarningCode.HierarchyOrder,
        SquadUpstreamWarningCode.ReservedFolderLimitation,
      ]);
    });
  });

  suite("purity", () => {
    test("is deterministic and does not mutate its input", () => {
      const upstreams: SquadUpstreamSource[] = [
        source("billing-project", "https://github.com/acme/squad/tree/main/project", SquadUpstreamKind.Git),
        source("nexus-org", "../org"),
      ];
      const snapshot = JSON.parse(JSON.stringify(upstreams));

      const first = service.recommend(upstreams);
      const second = service.recommend(upstreams);

      assert.deepStrictEqual(first, second);
      assert.deepStrictEqual(upstreams, snapshot);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(first)), first, "result is JSON-serialisable for postMessage");
    });
  });
});
