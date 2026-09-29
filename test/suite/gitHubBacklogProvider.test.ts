import * as assert from "assert";
import * as vscode from "vscode";
import {
  SquadBacklogDetectionSource,
  SquadBacklogProviderId,
  SquadGitRemote,
  SQUAD_BACKLOG_LABEL,
  SQUAD_UNTRIAGED_LABEL,
} from "../../src/features/squad/models";
import {
  GitHubBacklogProvider,
  GITHUB_BACKLOG_QUERY,
  parseGitHubRemote,
  selectGitHubRemote,
} from "../../src/features/squad/services/gitHubBacklogProvider";
import type {
  SquadProcessRunner,
  SquadSpawnRequest,
  SquadSpawnResult,
} from "../../src/features/squad/services/squadProcessRunner";

const ROOT = vscode.Uri.file("/tmp/workspace");

function fakeRunner(result: Partial<SquadSpawnResult>, captured: { request?: SquadSpawnRequest } = {}): SquadProcessRunner {
  return {
    async run(request: SquadSpawnRequest): Promise<SquadSpawnResult> {
      captured.request = request;
      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        cancelled: false,
        ...result,
      };
    },
  };
}

function context(remotes: SquadGitRemote[]) {
  return {
    workspaceRoot: ROOT,
    remotes,
    config: { platform: null, raw: null },
    source: SquadBacklogDetectionSource.GitRemote,
  };
}

suite("Unit: GitHubBacklogProvider (SQD-042)", () => {
  test("parseGitHubRemote supports HTTPS and scp-style GitHub remotes", () => {
    assert.deepStrictEqual(parseGitHubRemote({ name: "origin", url: "https://github.com/Owner/repo.git" }), {
      host: "github.com",
      owner: "Owner",
      repo: "repo",
      remoteName: "origin",
    });
    assert.deepStrictEqual(parseGitHubRemote({ name: "upstream", url: "git@github.com:NexusInnovation/nexkit.git" }), {
      host: "github.com",
      owner: "NexusInnovation",
      repo: "nexkit",
      remoteName: "upstream",
    });
  });

  test("selectGitHubRemote prefers origin/upstream and ignores non-GitHub hosts unless configured", () => {
    const remotes: SquadGitRemote[] = [
      { name: "fork", url: "https://git.example.com/team/repo.git" },
      { name: "upstream", url: "https://github.com/NexusInnovation/nexus-nexkit-vscode.git" },
      { name: "origin", url: "https://example.ghe.com/team/repo.git" },
    ];

    assert.strictEqual(selectGitHubRemote(remotes, false)?.remoteName, "origin");
    assert.strictEqual(selectGitHubRemote([{ name: "origin", url: "https://git.example.com/team/repo.git" }], false), null);
    assert.strictEqual(
      selectGitHubRemote([{ name: "origin", url: "https://git.example.com/team/repo.git" }], true)?.host,
      "git.example.com"
    );
  });

  test("detect invokes gh GraphQL with safe variables and returns issue counts", async () => {
    const captured: { request?: SquadSpawnRequest } = {};
    const provider = new GitHubBacklogProvider({
      runner: fakeRunner(
        {
          stdout: JSON.stringify({
            data: {
              repository: {
                nameWithOwner: "NexusInnovation/nexus-nexkit-vscode",
                url: "https://github.com/NexusInnovation/nexus-nexkit-vscode",
                hasIssuesEnabled: true,
                isArchived: false,
                openIssues: { totalCount: 12 },
                squadIssues: { totalCount: 7 },
                untriagedIssues: { totalCount: 2 },
              },
            },
          }),
        },
        captured
      ),
      ghCommand: "gh-test",
      timeoutMs: 123,
    });

    const result = await provider.detect(
      context([{ name: "origin", url: "https://github.com/NexusInnovation/nexus-nexkit-vscode.git" }])
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(captured.request?.command, "gh-test");
    assert.strictEqual(captured.request?.cwd, ROOT.fsPath);
    assert.strictEqual(captured.request?.timeoutMs, 123);
    assert.deepStrictEqual(captured.request?.args, [
      "api",
      "graphql",
      "--hostname",
      "github.com",
      "-f",
      `query=${GITHUB_BACKLOG_QUERY}`,
      "-f",
      "owner=NexusInnovation",
      "-f",
      "name=nexus-nexkit-vscode",
    ]);
    assert.ok(GITHUB_BACKLOG_QUERY.includes(SQUAD_BACKLOG_LABEL));
    assert.ok(GITHUB_BACKLOG_QUERY.includes(SQUAD_UNTRIAGED_LABEL));
    if (result.ok) {
      assert.strictEqual(result.value.providerId, SquadBacklogProviderId.GitHub);
      assert.strictEqual(result.value.displayName, "NexusInnovation/nexus-nexkit-vscode");
      assert.strictEqual(result.value.itemCounts.open, 12);
      assert.strictEqual(result.value.itemCounts.squad, 7);
      assert.strictEqual(result.value.itemCounts.untriaged, 2);
      assert.strictEqual(result.value.github?.owner, "NexusInnovation");
    }
  });

  test("detect returns an actionable tool error when gh is missing", async () => {
    const provider = new GitHubBacklogProvider({
      runner: fakeRunner({ exitCode: null, spawnErrorCode: "ENOENT" }),
    });

    const result = await provider.detect(context([{ name: "origin", url: "https://github.com/org/repo.git" }]));

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backlog-tool-not-found");
      assert.ok(result.error.remediation);
    }
  });

  test("detect maps GitHub API failures without producing a success-shaped state", async () => {
    const provider = new GitHubBacklogProvider({
      runner: fakeRunner({ exitCode: 1, stderr: "API rate limit exceeded" }),
    });

    const result = await provider.detect(context([{ name: "origin", url: "https://github.com/org/repo.git" }]));

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backlog-rate-limited");
      assert.ok(result.error.remediation);
    }
  });

  test("detect fails when GitHub Issues are disabled", async () => {
    const provider = new GitHubBacklogProvider({
      runner: fakeRunner({
        stdout: JSON.stringify({
          data: {
            repository: {
              nameWithOwner: "org/repo",
              url: "https://github.com/org/repo",
              hasIssuesEnabled: false,
              isArchived: false,
            },
          },
        }),
      }),
    });

    const result = await provider.detect(context([{ name: "origin", url: "https://github.com/org/repo.git" }]));

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backlog-unavailable");
      assert.match(result.error.message, /Issues are disabled/);
    }
  });
});
