import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { parseLogLine } from "../../src/features/devops-pipelines/buildLogParser";
import { BuildLogHostMessage, BuildLogViewService } from "../../src/features/devops-pipelines/buildLogViewService";
import { DevOpsProjectDiscoveryClient } from "../../src/features/apm-devops/devOpsProjectDiscoveryClient";
import { buildProjectUrl } from "../../src/features/apm-devops/devOpsProjectBrowserService";
import { parseDevOpsUrl } from "../../src/features/apm-devops/devOpsUrlParser";
import { DevOpsApiError, DevOpsBuildsClient } from "../../src/features/devops-pipelines/devOpsBuildsClient";
import { LoggingService } from "../../src/shared/services/loggingService";

suite("Unit: BuildLogViewService followBuild", () => {
  test("waits for the build and retains incremental logs from parallel tasks until completion", async () => {
    const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const executeCommand = sinon.stub(vscode.commands, "executeCommand").resolves();
    const client = {
      getBuild: sinon.stub(),
      getTimeline: sinon.stub(),
      getLogLines: sinon.stub(),
    };
    client.getBuild.onCall(0).resolves({ status: "notStarted" });
    client.getBuild.onCall(1).resolves({ status: "inProgress" });
    client.getBuild.onCall(2).resolves({ status: "completed" });
    const records = [
      { id: "one", type: "Task", name: "One", state: "inProgress", log: { id: 1 } },
      { id: "two", type: "Task", name: "Two", state: "inProgress", log: { id: 2 } },
    ];
    client.getTimeline.onCall(0).resolves({ records });
    client.getTimeline.onCall(1).resolves({ records: records.map((record) => ({ ...record, state: "completed" })) });
    client.getLogLines.onCall(0).resolves(["one first"]);
    client.getLogLines.onCall(1).resolves(["two first"]);
    client.getLogLines.onCall(2).resolves(["one last"]);
    client.getLogLines.onCall(3).resolves(["two last"]);
    const postMessage = sinon.stub().resolves(true);
    const service = new BuildLogViewService(
      vscode.Uri.file("/ext"),
      client as unknown as DevOpsBuildsClient,
      LoggingService.getInstance()
    );
    (service as unknown as { _view: unknown })._view = { webview: { postMessage } };

    try {
      const following = service.followBuild({ organization: "org", project: "proj" }, 7, "42");
      await clock.tickAsync(0);
      assert.strictEqual(client.getTimeline.callCount, 0);
      assert.ok(postMessage.getCalls().some((call) => call.args[0].text === "Waiting for the build to start…"));

      await clock.tickAsync(3_000);
      await clock.tickAsync(3_000);
      await following;

      assert.deepStrictEqual(
        client.getLogLines.getCalls().map((call) => call.args.slice(2)),
        [
          [1, 1],
          [2, 1],
          [1, 2],
          [2, 2],
        ]
      );
      const messages = postMessage.getCalls().map((call) => call.args[0] as BuildLogHostMessage);
      const lines = messages.flatMap((message) => (message.type === "lines" ? message.lines.map((line) => line.text) : []));
      assert.deepStrictEqual(lines, ["One", "one first", "Two", "two first", "One", "one last", "Two", "two last"]);
      assert.ok(messages.some((message) => message.type === "status" && message.text === "End of log" && !message.live));
    } finally {
      service.dispose();
      executeCommand.restore();
      clock.restore();
    }
  });
});

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
