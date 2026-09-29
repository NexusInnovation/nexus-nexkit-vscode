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
  AzureDevOpsBacklogProvider,
  buildAzureDevOpsWiql,
  parseAzureDevOpsRemote,
  selectAzureDevOpsRemote,
} from "../../src/features/squad/services/azureDevOpsBacklogProvider";
import type {
  SquadProcessRunner,
  SquadSpawnRequest,
  SquadSpawnResult,
} from "../../src/features/squad/services/squadProcessRunner";

const ROOT = vscode.Uri.file("/tmp/workspace");

function fakeRunner(
  results: Partial<SquadSpawnResult>[],
  captured: { requests: SquadSpawnRequest[] } = { requests: [] }
): SquadProcessRunner {
  let index = 0;
  return {
    async run(request: SquadSpawnRequest): Promise<SquadSpawnResult> {
      captured.requests.push(request);
      const result = results[Math.min(index, results.length - 1)] ?? {};
      index += 1;
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

function queryResult(count: number): Partial<SquadSpawnResult> {
  return {
    stdout: JSON.stringify({
      workItems: Array.from({ length: count }, (_unused, index) => ({ id: index + 1 })),
    }),
  };
}

function context(options: {
  raw?: Readonly<Record<string, unknown>> | null;
  source?: SquadBacklogDetectionSource;
  remotes?: SquadGitRemote[];
}) {
  return {
    workspaceRoot: ROOT,
    remotes: options.remotes ?? [],
    config: { platform: options.source === SquadBacklogDetectionSource.Config ? "ado" : null, raw: options.raw ?? null },
    source: options.source ?? SquadBacklogDetectionSource.GitRemote,
  };
}

suite("Unit: AzureDevOpsBacklogProvider (SQD-043)", () => {
  test("parseAzureDevOpsRemote supports dev.azure.com, visualstudio.com, and SSH remotes", () => {
    assert.deepStrictEqual(
      parseAzureDevOpsRemote({
        name: "origin",
        url: "https://dev.azure.com/contoso/Project%20One/_git/repo",
      }),
      {
        organization: "contoso",
        organizationUrl: "https://dev.azure.com/contoso",
        project: "Project One",
        remoteName: "origin",
      }
    );
    assert.deepStrictEqual(
      parseAzureDevOpsRemote({
        name: "upstream",
        url: "https://fabrikam.visualstudio.com/Platform/_git/repo",
      })?.organization,
      "fabrikam"
    );
    assert.deepStrictEqual(
      parseAzureDevOpsRemote({
        name: "ssh",
        url: "git@ssh.dev.azure.com:v3/nexus/Nexkit/repo",
      })?.project,
      "Nexkit"
    );
  });

  test("selectAzureDevOpsRemote prefers origin and ignores non-ADO remotes", () => {
    const remotes: SquadGitRemote[] = [
      { name: "fork", url: "https://dev.azure.com/fork/ForkProject/_git/repo" },
      { name: "upstream", url: "https://dev.azure.com/upstream/UpstreamProject/_git/repo" },
      { name: "origin", url: "https://dev.azure.com/origin/OriginProject/_git/repo" },
    ];

    assert.strictEqual(selectAzureDevOpsRemote(remotes)?.organization, "origin");
    assert.strictEqual(selectAzureDevOpsRemote([{ name: "origin", url: "https://github.com/org/repo.git" }]), null);
  });

  test("buildAzureDevOpsWiql scopes by open states, area, iteration, and tag", () => {
    const wiql = buildAzureDevOpsWiql(
      {
        organization: "contoso",
        organizationUrl: "https://dev.azure.com/contoso",
        project: "Project One",
        areaPath: "Project One\\Team's Area",
        iterationPath: "Project One\\Sprint 1",
      },
      SQUAD_UNTRIAGED_LABEL
    );

    assert.ok(wiql.includes("[System.State] <> 'Closed'"));
    assert.ok(wiql.includes("[System.AreaPath] UNDER 'Project One\\Team''s Area'"));
    assert.ok(wiql.includes("[System.IterationPath] UNDER 'Project One\\Sprint 1'"));
    assert.ok(wiql.includes(`[System.Tags] CONTAINS '${SQUAD_UNTRIAGED_LABEL}'`));
  });

  test("detect invokes az boards query with config ado coordinates and returns counts", async () => {
    const captured = { requests: [] as SquadSpawnRequest[] };
    const provider = new AzureDevOpsBacklogProvider({
      runner: fakeRunner([queryResult(9), queryResult(4), queryResult(1)], captured),
      azCommand: "az-test",
      timeoutMs: 123,
    });

    const result = await provider.detect(
      context({
        source: SquadBacklogDetectionSource.Config,
        raw: {
          platform: "azure-devops",
          ado: {
            org: "https://dev.azure.com/contoso",
            project: "Project One",
            defaultWorkItemType: "User Story",
            areaPath: "Project One\\Squad",
            iterationPath: "Project One\\Sprint 1",
          },
        },
      })
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(captured.requests.length, 3);
    assert.strictEqual(captured.requests[0].command, "az-test");
    assert.strictEqual(captured.requests[0].cwd, ROOT.fsPath);
    assert.strictEqual(captured.requests[0].timeoutMs, 123);
    assert.deepStrictEqual(captured.requests[0].args.slice(0, 7), [
      "boards",
      "query",
      "--organization",
      "https://dev.azure.com/contoso",
      "--project",
      "Project One",
      "--wiql",
    ]);
    assert.ok(captured.requests[1].args.includes(buildAzureDevOpsWiql(result.ok ? result.value.azureDevOps! : never(), SQUAD_BACKLOG_LABEL)));
    assert.ok(
      captured.requests[2].args.includes(buildAzureDevOpsWiql(result.ok ? result.value.azureDevOps! : never(), SQUAD_UNTRIAGED_LABEL))
    );
    if (result.ok) {
      assert.strictEqual(result.value.providerId, SquadBacklogProviderId.AzureDevOps);
      assert.strictEqual(result.value.displayName, "contoso/Project One");
      assert.strictEqual(result.value.url, "https://dev.azure.com/contoso/Project%20One");
      assert.strictEqual(result.value.remoteName, null);
      assert.deepStrictEqual(result.value.itemCounts, { open: 9, squad: 4, untriaged: 1 });
      assert.strictEqual(result.value.azureDevOps?.defaultWorkItemType, "User Story");
      assert.strictEqual(result.value.azureDevOps?.areaPath, "Project One\\Squad");
    }
  });

  test("detect can infer ADO coordinates from a git remote when platform is not configured", async () => {
    const provider = new AzureDevOpsBacklogProvider({
      runner: fakeRunner([queryResult(2), queryResult(1), queryResult(0)]),
    });

    const result = await provider.detect(
      context({
        remotes: [{ name: "origin", url: "https://dev.azure.com/contoso/Nexkit/_git/repo" }],
      })
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.remoteName, "origin");
      assert.strictEqual(result.value.azureDevOps?.organization, "contoso");
      assert.strictEqual(result.value.azureDevOps?.project, "Nexkit");
    }
  });

  test("detect requires ado config when Azure DevOps is explicitly configured", async () => {
    const provider = new AzureDevOpsBacklogProvider({
      runner: fakeRunner([queryResult(1)]),
    });

    const result = await provider.detect(
      context({
        source: SquadBacklogDetectionSource.Config,
        raw: { platform: "azure-devops" },
        remotes: [{ name: "origin", url: "https://dev.azure.com/contoso/Nexkit/_git/repo" }],
      })
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "parse-failed");
      assert.match(result.error.message, /missing an `ado` object/);
    }
  });

  test("detect returns an actionable tool error when az is missing", async () => {
    const provider = new AzureDevOpsBacklogProvider({
      runner: fakeRunner([{ exitCode: null, spawnErrorCode: "ENOENT" }]),
    });

    const result = await provider.detect(
      context({
        raw: { ado: { org: "contoso", project: "Nexkit" } },
      })
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backlog-tool-not-found");
      assert.ok(result.error.remediation);
    }
  });

  test("detect maps Azure DevOps auth failures without producing a success-shaped state", async () => {
    const provider = new AzureDevOpsBacklogProvider({
      runner: fakeRunner([{ exitCode: 1, stderr: "ERROR: Please run 'az login' to setup account." }]),
    });

    const result = await provider.detect(
      context({
        raw: { ado: { org: "contoso", project: "Nexkit" } },
      })
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backlog-auth-required");
      assert.ok(result.error.remediation);
    }
  });
});

function never(): never {
  throw new Error("Unexpected failed result");
}
