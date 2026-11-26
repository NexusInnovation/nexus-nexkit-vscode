import * as assert from "assert";
import * as sinon from "sinon";
import { parseLogLine } from "../../src/features/devops-pipelines/buildLogParser";
import { DevOpsProjectDiscoveryClient } from "../../src/features/apm-devops/devOpsProjectDiscoveryClient";
import { buildProjectUrl } from "../../src/features/apm-devops/devOpsProjectBrowserService";
import { parseDevOpsUrl } from "../../src/features/apm-devops/devOpsUrlParser";
import { DevOpsApiError } from "../../src/features/devops-pipelines/devOpsBuildsClient";

suite("Unit: parseLogLine", () => {
  test("splits the ISO timestamp into an HH:mm:ss time", () => {
    assert.deepStrictEqual(parseLogLine("2026-11-09T22:45:39.2665543Z hello"), {
      time: "22:45:39",
      kind: "plain",
      text: "hello",
    });
  });

  test("classifies errors, warnings and sections and drops their marker", () => {
    assert.deepStrictEqual(parseLogLine("2026-11-09T22:45:39.0Z ##[error]boom"), {
      time: "22:45:39",
      kind: "error",
      text: "boom",
    });
    assert.strictEqual(parseLogLine("2026-11-09T22:45:39.0Z ##[warning]careful")?.kind, "warning");
    assert.strictEqual(parseLogLine("2026-11-09T22:45:39.0Z ##[section]Starting: X")?.kind, "section");
  });

  test("group terminators are skipped and ANSI colours stripped", () => {
    assert.strictEqual(parseLogLine("2026-11-09T22:45:39.0Z ##[endgroup]"), undefined);
    assert.strictEqual(parseLogLine("\u001b[31mred\u001b[0m")?.text, "red");
  });

  test("lines without timestamp or directive are kept as is", () => {
    assert.deepStrictEqual(parseLogLine("plain text"), { time: "", kind: "plain", text: "plain text" });
  });
});

suite("Unit: DevOpsProjectDiscoveryClient", () => {
  let fetchStub: sinon.SinonStub;
  let getToken: sinon.SinonStub;
  let client: DevOpsProjectDiscoveryClient;

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  setup(() => {
    fetchStub = sinon.stub();
    getToken = sinon.stub().resolves("tok");
    client = new DevOpsProjectDiscoveryClient({ getAccessToken: getToken }, "agent/1", fetchStub as unknown as typeof fetch);
  });

  test("lists the organizations of the signed-in profile, sorted", async () => {
    fetchStub.onCall(0).resolves(json({ id: "me-1" }));
    fetchStub.onCall(1).resolves(json({ value: [{ accountName: "zeta" }, { accountName: "alpha" }, {}] }));

    const organizations = await client.listOrganizations();

    assert.deepStrictEqual(organizations, ["alpha", "zeta"]);
    assert.ok(getToken.alwaysCalledWith(true));
    assert.ok(fetchStub.getCall(1).args[0].includes("memberId=me-1"));
    assert.strictEqual(fetchStub.getCall(0).args[1].headers["User-Agent"], "agent/1");
  });

  test("lists the projects of an organization, sorted", async () => {
    fetchStub.resolves(json({ value: [{ name: "Zed" }, { name: "App" }] }));

    assert.deepStrictEqual(await client.listProjects("my org"), ["App", "Zed"]);
    assert.ok(fetchStub.getCall(0).args[0].startsWith("https://dev.azure.com/my%20org/_apis/projects"));
  });

  test("reports denied access and missing sign-in as auth errors", async () => {
    fetchStub.resolves(json({}, 403));
    await assert.rejects(
      () => client.listProjects("org"),
      (error: DevOpsApiError) => error.kind === "auth"
    );

    getToken.resolves(undefined);
    await assert.rejects(
      () => client.listProjects("org"),
      (error: DevOpsApiError) => error.kind === "auth"
    );
  });
});

suite("Unit: buildProjectUrl", () => {
  test("builds a URL that the DevOps URL parser reads back", () => {
    const parsed = parseDevOpsUrl(buildProjectUrl("my-org", "My Project"));

    assert.ok(parsed.isValid);
    assert.strictEqual(parsed.organization, "my-org");
    assert.strictEqual(parsed.project, "My Project");
  });
});
