/**
 * Tests for SquadFileService (SQD-011).
 * Read-only reader for the workspace `.squad/` directory.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";
import * as vscode from "vscode";
import { SquadFileService, SquadLogKind, SQUAD_MAX_READ_BYTES } from "../../src/features/squad/services/squadFileService";
import { isSquadOk, isSquadErr, SquadDocKind, SquadMarketplaceKind, SquadUpstreamKind } from "../../src/features/squad/models";

const TEAM_MD = `# Squad Team

## Members

| Name     | Role             | Charter                             | Status    |
| -------- | ---------------- | ----------------------------------- | --------- |
| Morpheus | Lead / Architect | \`.squad/agents/morpheus/charter.md\` | 🟢 Active  |
| Link     | Extension Dev    | \`.squad/agents/link/charter.md\`     | 🟢 Active  |

## Project Context

- Owner: Someone
`;

suite("Unit: SquadFileService", () => {
  let tempDir: string;
  let squadDir: string;
  let service: SquadFileService;

  function writeFile(relativePath: string, content: string): void {
    const full = path.join(tempDir, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-squad-file-"));
    squadDir = path.join(tempDir, ".squad");
    fs.mkdirSync(squadDir, { recursive: true });
    service = new SquadFileService(vscode.Uri.file(tempDir));
  });

  teardown(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // --- roster (FR-022) ---

  test("readRoster parses members and correlates charters", async () => {
    writeFile(".squad/team.md", TEAM_MD);
    writeFile(".squad/agents/morpheus/charter.md", "# Morpheus");
    // Link has no charter file on disk.

    const result = await service.readRoster();
    assert.ok(isSquadOk(result));
    const members = result.value;
    assert.strictEqual(members.length, 2);

    const morpheus = members.find((m) => m.id === "morpheus");
    assert.ok(morpheus);
    assert.strictEqual(morpheus.name, "Morpheus");
    assert.strictEqual(morpheus.role, "Lead / Architect");
    assert.strictEqual(morpheus.hasCharter, true);

    const link = members.find((m) => m.id === "link");
    assert.ok(link);
    assert.strictEqual(link.hasCharter, false);
  });

  test("readRoster fails with file-read-failed when team.md is missing", async () => {
    const result = await service.readRoster();
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "file-read-failed");
    assert.ok(result.error.remediation && result.error.remediation.length > 0);
  });

  test("readRoster fails with parse-failed when there is no Members table", async () => {
    writeFile(".squad/team.md", "# Squad Team\n\nNo members here.\n");
    const result = await service.readRoster();
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "parse-failed");
  });

  // --- charter (FR-022) ---

  test("readCharter returns raw markdown content", async () => {
    writeFile(".squad/agents/link/charter.md", "# Link\n\nExtension dev.");
    const result = await service.readCharter("link");
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.agentId, "link");
    assert.strictEqual(result.value.relativePath, ".squad/agents/link/charter.md");
    assert.ok(result.value.content.includes("Extension dev."));
  });

  test("readCharter fails cleanly for a missing agent", async () => {
    const result = await service.readCharter("ghost");
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "file-read-failed");
  });

  test("readCharter rejects path traversal in the agent id", async () => {
    const result = await service.readCharter("../secrets");
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "file-read-failed");
    assert.strictEqual(result.error.detail, "../secrets");
  });

  // --- governance docs (FR-024) ---

  test("readDecisions returns exists:true with content when present", async () => {
    writeFile(".squad/decisions.md", "# Decisions\n\n- one");
    const result = await service.readDecisions();
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.kind, SquadDocKind.Decisions);
    assert.strictEqual(result.value.exists, true);
    assert.ok(result.value.content.includes("Decisions"));
  });

  test("readRouting returns exists:false with empty content when absent", async () => {
    const result = await service.readRouting();
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.kind, SquadDocKind.Routing);
    assert.strictEqual(result.value.exists, false);
    assert.strictEqual(result.value.content, "");
  });

  test("readDecisions exposes a SHA-256 contentHash of the on-disk bytes (SQD-027)", async () => {
    writeFile(".squad/decisions.md", "# Decisions\r\n- one\r\n");
    const result = await service.readDecisions();
    assert.ok(isSquadOk(result));
    assert.strictEqual(
      result.value.contentHash,
      createHash("sha256").update("# Decisions\r\n- one\r\n", "utf8").digest("hex")
    );
    assert.strictEqual(result.value.truncated, false);
  });

  test("readRouting reports a null contentHash when absent", async () => {
    const result = await service.readRouting();
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.contentHash, null);
    assert.strictEqual(result.value.truncated, false);
  });

  test("readDecisions flags truncation and hashes the full file for large docs", async () => {
    const big = "d".repeat(SQUAD_MAX_READ_BYTES + 10);
    writeFile(".squad/decisions.md", big);
    const result = await service.readDecisions();
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.truncated, true);
    assert.strictEqual(result.value.content.length, SQUAD_MAX_READ_BYTES);
    assert.strictEqual(result.value.contentHash, createHash("sha256").update(big, "utf8").digest("hex"));
  });

  // --- histories & logs (FR-025) ---

  test("readAgentHistory returns content and truncated flag for large files", async () => {
    const big = "x".repeat(SQUAD_MAX_READ_BYTES + 1024);
    writeFile(".squad/agents/link/history.md", big);
    const result = await service.readAgentHistory("link");
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.truncated, true);
    assert.strictEqual(result.value.sizeBytes, big.length);
    assert.strictEqual(result.value.content.length, SQUAD_MAX_READ_BYTES);
  });

  test("readAgentHistory returns full content for small files", async () => {
    writeFile(".squad/agents/link/history.md", "short history");
    const result = await service.readAgentHistory("link");
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.truncated, false);
    assert.strictEqual(result.value.content, "short history");
  });

  test("listLogs returns sorted session log refs", async () => {
    writeFile(".squad/log/2026-06-03-b.md", "b");
    writeFile(".squad/log/2026-06-01-a.md", "a");
    writeFile(".squad/log/notes.txt", "ignored");

    const result = await service.listLogs(SquadLogKind.Session);
    assert.ok(isSquadOk(result));
    const names = result.value.map((r) => r.name);
    assert.deepStrictEqual(names, ["2026-06-01-a.md", "2026-06-03-b.md"]);
    assert.strictEqual(result.value[0].kind, SquadLogKind.Session);
    assert.strictEqual(result.value[0].relativePath, ".squad/log/2026-06-01-a.md");
  });

  test("listLogs returns an empty list when the log directory is absent", async () => {
    const result = await service.listLogs(SquadLogKind.Orchestration);
    assert.ok(isSquadOk(result));
    assert.deepStrictEqual(result.value, []);
  });

  test("readLog reads an orchestration log by name", async () => {
    writeFile(".squad/orchestration-log/2026-06-03-coord.md", "coordinator log");
    const result = await service.readLog(SquadLogKind.Orchestration, "2026-06-03-coord.md");
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.content, "coordinator log");
  });

  test("readLog rejects a name with path separators", async () => {
    const result = await service.readLog(SquadLogKind.Session, "../team.md");
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "file-read-failed");
  });

  // --- upstreams (FR-030) ---

  test("readUpstreams parses sources with normalized kind and dates", async () => {
    writeFile(
      ".squad/upstream.json",
      JSON.stringify({
        sources: [
          { id: "org", type: "git", reference: "https://example.com/org.git", lastSync: "2026-06-01T00:00:00Z" },
          { name: "local-team", kind: "local", path: "../team" },
        ],
      })
    );

    const result = await service.readUpstreams();
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.length, 2);

    const [org, team] = result.value;
    assert.strictEqual(org.id, "org");
    assert.strictEqual(org.kind, SquadUpstreamKind.Git);
    assert.strictEqual(org.reference, "https://example.com/org.git");
    assert.strictEqual(org.lastSyncedAt, Date.parse("2026-06-01T00:00:00Z"));

    assert.strictEqual(team.id, "local-team");
    assert.strictEqual(team.kind, SquadUpstreamKind.Local);
    assert.strictEqual(team.reference, "../team");
    assert.strictEqual(team.lastSyncedAt, undefined);
  });

  test("readUpstreams accepts a bare array manifest", async () => {
    writeFile(".squad/upstream.json", JSON.stringify([{ id: "x", kind: "export", url: "https://e/x.json" }]));
    const result = await service.readUpstreams();
    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.length, 1);
    assert.strictEqual(result.value[0].kind, SquadUpstreamKind.Export);
  });

  test("readUpstreams returns an empty list when the manifest is absent", async () => {
    const result = await service.readUpstreams();
    assert.ok(isSquadOk(result));
    assert.deepStrictEqual(result.value, []);
  });

  // --- model config (FR-063) ---

  test("readModelConfig parses default and per-agent overrides", async () => {
    const content = JSON.stringify({ default: "gpt-5.6-terra", overrides: { neo: "gpt-5.6-sol", tank: "gpt-5.6-luna" } });
    writeFile(".squad/model-config.json", content);

    const result = await service.readModelConfig();

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.validationError, undefined);
    assert.deepStrictEqual(result.value.document, {
      relativePath: ".squad/model-config.json",
      exists: true,
      content,
      config: {
        defaultModel: "gpt-5.6-terra",
        overrides: [
          { agentId: "neo", model: "gpt-5.6-sol" },
          { agentId: "tank", model: "gpt-5.6-luna" },
        ],
      },
    });
  });

  test("readModelConfig reports an absent file as exists:false without an error", async () => {
    const result = await service.readModelConfig();

    assert.ok(isSquadOk(result));
    assert.deepStrictEqual(result.value, {
      document: { relativePath: ".squad/model-config.json", exists: false, content: "", config: null },
    });
  });

  test("readModelConfig keeps malformed JSON visible with a parse-failed validation error", async () => {
    writeFile(".squad/model-config.json", '{ "default": ');

    const result = await service.readModelConfig();

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.document.exists, true);
    assert.strictEqual(result.value.document.content, '{ "default": ');
    assert.strictEqual(result.value.document.config, null);
    assert.strictEqual(result.value.validationError?.code, "parse-failed");
    assert.ok(result.value.validationError?.remediation);
  });

  test("readModelConfig flags schema violations", async () => {
    writeFile(".squad/model-config.json", JSON.stringify({ overrides: ["neo"] }));

    const result = await service.readModelConfig();

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.document.config, null);
    assert.strictEqual(result.value.validationError?.code, "parse-failed");
    assert.ok(result.value.validationError?.detail?.includes('"overrides"'));
  });

  test("readModelConfig refuses oversized files instead of validating truncated JSON", async () => {
    writeFile(".squad/model-config.json", `{ "default": "m", "pad": "${"x".repeat(SQUAD_MAX_READ_BYTES)}" }`);

    const result = await service.readModelConfig();

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "file-read-failed");
  });

  test("readUpstreams fails with parse-failed on invalid JSON", async () => {
    writeFile(".squad/upstream.json", "{ not json ");
    const result = await service.readUpstreams();
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "parse-failed");
  });

  // --- plugin marketplaces (FR-042) ---

  test("readPluginMarketplaces parses marketplace entries from the manifest", async () => {
    writeFile(
      ".squad/plugins/marketplaces.json",
      JSON.stringify({
        marketplaces: [
          "NexusInnovation/nexus-plugin-marketplace#main",
          {
            id: "team",
            displayName: "Team Marketplace",
            type: "url",
            url: "https://example.com/team-marketplace.json",
            enabled: false,
            ref: "stable",
            lastRefresh: "2026-09-28T00:00:00Z",
          },
        ],
      })
    );

    const result = await service.readPluginMarketplaces();

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.length, 2);
    assert.strictEqual(result.value[0].id, "nexus-plugin-marketplace");
    assert.strictEqual(result.value[0].kind, SquadMarketplaceKind.GitHub);
    assert.strictEqual(result.value[0].enabled, true);
    assert.strictEqual(result.value[1].id, "team");
    assert.strictEqual(result.value[1].displayName, "Team Marketplace");
    assert.strictEqual(result.value[1].kind, SquadMarketplaceKind.Url);
    assert.strictEqual(result.value[1].enabled, false);
    assert.strictEqual(result.value[1].ref, "stable");
    assert.strictEqual(result.value[1].lastRefreshedAt, Date.parse("2026-09-28T00:00:00Z"));
  });

  test("readPluginMarketplaces returns an empty list when the manifest is absent", async () => {
    const result = await service.readPluginMarketplaces();
    assert.ok(isSquadOk(result));
    assert.deepStrictEqual(result.value, []);
  });

  test("readPluginMarketplaces fails with parse-failed on invalid JSON", async () => {
    writeFile(".squad/plugins/marketplaces.json", "{ not json ");
    const result = await service.readPluginMarketplaces();
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "parse-failed");
    assert.ok(result.error.remediation);
  });

  test("readUpstreams fails with parse-failed when the manifest shape is unsupported", async () => {
    writeFile(".squad/upstream.json", JSON.stringify({ upstreams: [] }));
    const result = await service.readUpstreams();
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "parse-failed");
    assert.ok(result.error.remediation && result.error.remediation.length > 0);
  });

  test("readUpstreams fails with parse-failed when a source is incomplete", async () => {
    writeFile(".squad/upstream.json", JSON.stringify({ sources: [{ id: "org", kind: "git" }] }));
    const result = await service.readUpstreams();
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "parse-failed");
    assert.ok(result.error.detail?.includes("index 0"));
  });

  test("readUpstreams fails with parse-failed when a source kind is unsupported", async () => {
    writeFile(".squad/upstream.json", JSON.stringify({ sources: [{ id: "org", kind: "svn", reference: "repo" }] }));
    const result = await service.readUpstreams();
    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "parse-failed");
    assert.ok(result.error.detail?.includes("unsupported kind"));
  });
});
