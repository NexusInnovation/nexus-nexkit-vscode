import * as assert from "assert";
import * as sinon from "sinon";
import { DevOpsApiError, DevOpsBuildsClient } from "../../src/features/devops-pipelines/devOpsBuildsClient";
import { IDevOpsAuthProvider } from "../../src/features/devops-pipelines/devOpsAuthProvider";

const ref = { organization: "my org", project: "Firebolt-Dashboard" };

function jsonResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });
}

suite("Unit: DevOpsBuildsClient", () => {
  let fetchStub: sinon.SinonStub;
  let auth: IDevOpsAuthProvider;
  let client: DevOpsBuildsClient;

  setup(() => {
    fetchStub = sinon.stub();
    auth = { getAccessToken: sinon.stub().resolves("token-123") };
    client = new DevOpsBuildsClient(auth, "nexus-nexkit-vscode/1.0.0", fetchStub as unknown as typeof fetch);
  });

  test("listBuilds calls the project builds endpoint with bearer token and user agent", async () => {
    fetchStub.resolves(jsonResponse({ value: [{ id: 1, buildNumber: "1" }] }));

    const builds = await client.listBuilds(ref, 10);

    assert.strictEqual(builds.length, 1);
    const [url, init] = fetchStub.getCall(0).args;
    assert.ok(url.startsWith("https://dev.azure.com/my%20org/Firebolt-Dashboard/_apis/build/builds?$top=10"));
    assert.ok(url.includes("api-version=7.1"));
    assert.strictEqual(init.headers.Authorization, "Bearer token-123");
    assert.strictEqual(init.headers["User-Agent"], "nexus-nexkit-vscode/1.0.0");
  });

  test("cancelBuild sends a PATCH with status cancelling", async () => {
    fetchStub.resolves(jsonResponse({}));

    await client.cancelBuild(ref, 42);

    const [url, init] = fetchStub.getCall(0).args;
    assert.ok(url.includes("/_apis/build/builds/42?"));
    assert.strictEqual(init.method, "PATCH");
    assert.deepStrictEqual(JSON.parse(init.body), { status: "cancelling" });
  });

  test("runPipeline queues a build of the definition on the given ref", async () => {
    fetchStub.resolves(jsonResponse({ id: 77, buildNumber: "77" }));

    const build = await client.runPipeline(ref, 12, "refs/heads/develop");

    assert.strictEqual(build.id, 77);
    const [url, init] = fetchStub.getCall(0).args;
    assert.ok(url.includes("/_apis/build/builds?"));
    assert.strictEqual(init.method, "POST");
    assert.deepStrictEqual(JSON.parse(init.body), { definition: { id: 12 }, sourceBranch: "refs/heads/develop" });
  });

  test("listPipelines asks for the latest run of every definition", async () => {
    fetchStub.resolves(jsonResponse({ value: [{ id: 1, name: "CI" }] }));

    const pipelines = await client.listPipelines(ref);

    assert.strictEqual(pipelines[0].name, "CI");
    assert.ok(fetchStub.getCall(0).args[0].includes("/_apis/build/definitions?includeLatestBuilds=true"));
  });

  test("listBranches returns the head refs of a repository", async () => {
    fetchStub.resolves(jsonResponse({ value: [{ name: "refs/heads/main" }, { name: "refs/heads/dev" }, {}] }));

    const branches = await client.listBranches(ref, "repo-1");

    assert.deepStrictEqual(branches, ["refs/heads/main", "refs/heads/dev"]);
    assert.ok(fetchStub.getCall(0).args[0].includes("/_apis/git/repositories/repo-1/refs?filter=heads/"));
  });

  test("countActiveBuilds counts running and queued builds", async () => {
    fetchStub.resolves(jsonResponse({ count: 2, value: [{ id: 1 }, { id: 2 }] }));

    assert.strictEqual(await client.countActiveBuilds(ref), 2);
    assert.ok(fetchStub.getCall(0).args[0].includes("statusFilter=inProgress,notStarted"));
  });

  test("countActiveBuilds sums every page", async () => {
    const page = (items: unknown[], token?: string): Response =>
      new Response(JSON.stringify({ value: items }), {
        status: 200,
        headers: { "content-type": "application/json", ...(token ? { "x-ms-continuationtoken": token } : {}) },
      });
    fetchStub.onCall(0).resolves(page([{ id: 1 }, { id: 2 }], "next page"));
    fetchStub.onCall(1).resolves(page([{ id: 3 }]));

    assert.strictEqual(await client.countActiveBuilds(ref), 3);
    assert.ok(fetchStub.getCall(1).args[0].includes("continuationToken=next%20page"));
  });

  test("listPipelines follows the continuation token", async () => {
    fetchStub.onCall(0).resolves(
      new Response(JSON.stringify({ value: [{ id: 1, name: "A" }] }), {
        status: 200,
        headers: { "content-type": "application/json", "x-ms-continuationtoken": "t1" },
      })
    );
    fetchStub.onCall(1).resolves(jsonResponse({ value: [{ id: 2, name: "B" }] }));

    const pipelines = await client.listPipelines(ref);

    assert.deepStrictEqual(
      pipelines.map((p) => p.name),
      ["A", "B"]
    );
    assert.strictEqual(fetchStub.callCount, 2);
  });

  test("throws an auth error without calling the API when no token is available", async () => {
    (auth.getAccessToken as sinon.SinonStub).resolves(undefined);

    await assert.rejects(
      () => client.listBuilds(ref),
      (error: DevOpsApiError) => error.kind === "auth"
    );
    assert.ok(fetchStub.notCalled);
  });

  test("maps HTTP failures to typed errors", async () => {
    const cases: Array<[number, string]> = [
      [401, "auth"],
      [403, "forbidden"],
      [404, "notFound"],
      [429, "rateLimited"],
      [500, "http"],
    ];
    for (const [status, kind] of cases) {
      fetchStub.resolves(jsonResponse({}, status));
      await assert.rejects(
        () => client.listBuilds(ref),
        (error: DevOpsApiError) => error.kind === kind && error.status === status,
        `status ${status}`
      );
    }
  });

  test("treats a non-JSON success response (sign-in page) as an auth error", async () => {
    fetchStub.resolves(new Response("<html>sign in</html>", { status: 203, headers: { "content-type": "text/html" } }));

    await assert.rejects(
      () => client.listBuilds(ref),
      (error: DevOpsApiError) => error.kind === "auth"
    );
  });

  test("getStageDependencies previews the pipeline and parses stage dependencies", async () => {
    fetchStub.resolves(
      jsonResponse({ finalYaml: "stages:\n- stage: A\n- stage: B\n  dependsOn: []\n- stage: C\n  dependsOn: [A, B]\n" })
    );

    const result = await client.getStageDependencies(ref, {
      id: 1,
      buildNumber: "1",
      status: "completed",
      sourceBranch: "refs/heads/main",
      sourceVersion: "abc",
      definition: { id: 332, name: "p" },
      templateParameters: { env: "dev" },
    });

    assert.deepStrictEqual(
      [...(result ?? [])],
      [
        ["A", []],
        ["B", []],
        ["C", ["A", "B"]],
      ]
    );
    const [url, init] = fetchStub.getCall(0).args;
    assert.ok(url.includes("/_apis/pipelines/332/preview?"));
    assert.strictEqual(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.strictEqual(body.previewRun, true);
    assert.deepStrictEqual(body.resources.repositories.self, { refName: "refs/heads/main", version: "abc" });
    assert.deepStrictEqual(body.templateParameters, { env: "dev" });
  });

  test("getStageDependencies retries without the commit and gives up quietly on failures", async () => {
    fetchStub.resolves(jsonResponse({}, 500));

    const result = await client.getStageDependencies(ref, {
      id: 1,
      buildNumber: "1",
      status: "completed",
      sourceBranch: "refs/heads/main",
      sourceVersion: "abc",
      definition: { id: 332, name: "p" },
    });

    assert.strictEqual(result, undefined);
    assert.strictEqual(fetchStub.callCount, 3);
    assert.strictEqual(JSON.parse(fetchStub.getCall(1).args[1].body).resources.repositories.self.version, undefined);
  });

  test("getStageDependencies falls back to the PR source branch then the default branch", async () => {
    const yaml = "stages:\n- stage: Build\n- stage: Test\n  dependsOn: Build\n";
    const build = {
      id: 1,
      buildNumber: "1",
      status: "completed",
      sourceBranch: "refs/pull/5/merge",
      triggerInfo: { "pr.sourceBranch": "refs/heads/feature/x" },
      definition: { id: 9, name: "p" },
    };
    fetchStub.onCall(0).resolves(jsonResponse({}, 400));
    fetchStub.onCall(1).resolves(jsonResponse({ finalYaml: yaml }));

    const fromPullRequest = await client.getStageDependencies(ref, build);
    assert.deepStrictEqual(fromPullRequest?.get("Test"), ["Build"]);
    assert.strictEqual(JSON.parse(fetchStub.getCall(1).args[1].body).resources.repositories.self.refName, "refs/heads/feature/x");

    fetchStub.reset();
    fetchStub.onCall(0).resolves(jsonResponse({}, 400));
    fetchStub.onCall(1).resolves(jsonResponse({}, 400));
    fetchStub.onCall(2).resolves(jsonResponse({ repository: { defaultBranch: "refs/heads/main" } }));
    fetchStub.onCall(3).resolves(jsonResponse({ finalYaml: yaml }));

    const fromDefault = await client.getStageDependencies(ref, build);
    assert.deepStrictEqual(fromDefault?.get("Test"), ["Build"]);
    assert.strictEqual(JSON.parse(fetchStub.getCall(3).args[1].body).resources.repositories.self.refName, "refs/heads/main");
  });

  test("getStageDependencies propagates auth errors", async () => {
    fetchStub.resolves(jsonResponse({}, 401));

    await assert.rejects(
      () =>
        client.getStageDependencies(ref, {
          id: 1,
          buildNumber: "1",
          status: "completed",
          sourceBranch: "refs/heads/main",
          definition: { id: 1, name: "p" },
        }),
      (error: DevOpsApiError) => error.kind === "auth"
    );
  });

  test("getBuildAuthor returns the first change author and swallows non-auth failures", async () => {
    fetchStub.onCall(0).resolves(jsonResponse({ value: [{ author: { displayName: "Eric De Carufel" } }] }));
    fetchStub.onCall(1).resolves(jsonResponse({}, 500));

    assert.deepStrictEqual(await client.getBuildAuthor(ref, 42), { displayName: "Eric De Carufel" });
    assert.ok(fetchStub.getCall(0).args[0].includes("/_apis/build/builds/42/changes?$top=1"));
    assert.strictEqual(await client.getBuildAuthor(ref, 42), undefined);
  });

  test("getAvatarDataUri authenticates Azure DevOps avatars only and rejects unknown hosts and non-images", async () => {
    const png = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
    fetchStub.onCall(0).resolves(png());
    fetchStub.onCall(1).resolves(png());
    fetchStub.onCall(2).resolves(jsonResponse({}, 200, "text/html"));

    assert.strictEqual(
      await client.getAvatarDataUri("https://dev.azure.com/org/_apis/GraphProfile/MemberAvatars/x"),
      "data:image/png;base64,AQID"
    );
    assert.strictEqual(fetchStub.getCall(0).args[1].headers.Authorization, "Bearer token-123");
    assert.ok((await client.getAvatarDataUri("https://avatars.githubusercontent.com/u/1")) !== undefined);
    assert.strictEqual(fetchStub.getCall(1).args[1].headers.Authorization, undefined);
    assert.strictEqual(await client.getAvatarDataUri("https://dev.azure.com/sign-in"), undefined);
    assert.strictEqual(await client.getAvatarDataUri("https://evil.example.com/a.png"), undefined);
    assert.strictEqual(await client.getAvatarDataUri("http://dev.azure.com/a.png"), undefined);
    assert.strictEqual(fetchStub.callCount, 3);
  });

  test("getLogLines requests lines from the given start line", async () => {
    fetchStub.resolves(jsonResponse({ count: 2, value: ["a", "b"] }));

    const lines = await client.getLogLines(ref, 42, 7, 11);

    assert.deepStrictEqual(lines, ["a", "b"]);
    assert.ok(fetchStub.getCall(0).args[0].includes("/_apis/build/builds/42/logs/7?startLine=11&"));
  });

  test("wraps network failures", async () => {
    fetchStub.rejects(new Error("offline"));

    await assert.rejects(
      () => client.listBuilds(ref),
      (error: DevOpsApiError) => error.kind === "network" && error.message === "offline"
    );
  });
});
