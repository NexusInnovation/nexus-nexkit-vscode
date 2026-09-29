import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  SquadBacklogContext,
  SquadBacklogDetectionSource,
  SquadBacklogNotDetectedReason,
  SquadBacklogProvider,
  SquadBacklogProviderId,
  SquadBacklogProviderInfo,
  SquadGitRemote,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";
import {
  parseGitRemotes,
  SquadBacklogFileReader,
  SquadBacklogService,
} from "../../src/features/squad/services/squadBacklogService";
import type {
  SquadProcessRunner,
  SquadSpawnRequest,
  SquadSpawnResult,
} from "../../src/features/squad/services/squadProcessRunner";

const ROOT = vscode.Uri.file("/tmp/workspace");

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

function fileReader(config: string | null): SquadBacklogFileReader {
  return {
    async exists(uri: vscode.Uri): Promise<boolean> {
      return config !== null && uri.path.endsWith("/.squad/config.json");
    },
    async readFile(): Promise<string> {
      if (config === null) {
        throw new Error("ENOENT");
      }
      return config;
    },
  };
}

function runner(result: Partial<SquadSpawnResult>, captured: { request?: SquadSpawnRequest } = {}): SquadProcessRunner {
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

function providerInfo(): SquadBacklogProviderInfo {
  return {
    providerId: SquadBacklogProviderId.GitHub,
    displayName: "org/repo",
    url: "https://github.com/org/repo",
    remoteName: "origin",
    readOnly: false,
    itemCounts: { open: 5, squad: 2, untriaged: 1 },
    github: { host: "github.com", owner: "org", repo: "repo" },
  };
}

function fakeProvider(
  options: {
    id?: SquadBacklogProviderId;
    matches?: boolean;
    result?: ReturnType<typeof squadOk<SquadBacklogProviderInfo>> | ReturnType<typeof squadErr>;
  } = {}
): SquadBacklogProvider & { matches: sinon.SinonStub; detect: sinon.SinonStub } {
  return {
    id: options.id ?? SquadBacklogProviderId.GitHub,
    displayName: "GitHub Issues",
    matches: sinon.stub().returns(options.matches ?? true),
    detect: sinon.stub().resolves(options.result ?? squadOk(providerInfo())),
  };
}

suite("Unit: SquadBacklogService (SQD-042)", () => {
  test("parseGitRemotes keeps fetch remotes in order and deduplicates push entries", () => {
    assert.deepStrictEqual(
      parseGitRemotes(
        [
          "origin\thttps://github.com/org/repo.git (fetch)",
          "origin\thttps://github.com/org/repo.git (push)",
          "upstream\tgit@github.com:upstream/repo.git (fetch)",
        ].join("\n")
      ),
      [
        { name: "origin", url: "https://github.com/org/repo.git" },
        { name: "upstream", url: "git@github.com:upstream/repo.git" },
      ]
    );
  });

  test("detect infers a GitHub backlog from git remotes and stamps the detection source", async () => {
    const captured: { request?: SquadSpawnRequest } = {};
    const provider = fakeProvider();
    const service = new SquadBacklogService({
      providers: [provider],
      fileReader: fileReader(null),
      runner: runner({ stdout: "origin\thttps://github.com/org/repo.git (fetch)\n" }, captured),
      logger: silentLogger,
      now: () => 42,
    });

    const result = await service.detect(ROOT);

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(captured.request?.args, ["remote", "-v"]);
    sinon.assert.calledOnce(provider.matches);
    sinon.assert.calledOnce(provider.detect);
    const providerContext = provider.detect.firstCall.args[0] as SquadBacklogContext;
    assert.strictEqual(providerContext.source, SquadBacklogDetectionSource.GitRemote);
    assert.deepStrictEqual(providerContext.remotes, [{ name: "origin", url: "https://github.com/org/repo.git" }]);
    if (result.ok) {
      assert.strictEqual(result.value.status, "detected");
      if (result.value.status === "detected") {
        assert.strictEqual(result.value.detectedAt, 42);
        assert.strictEqual(result.value.backlog.source, SquadBacklogDetectionSource.GitRemote);
        assert.strictEqual(result.value.backlog.displayName, "org/repo");
      }
    }
  });

  test("detect honors configured platform aliases before provider remote matching", async () => {
    const provider = fakeProvider({ matches: false });
    const service = new SquadBacklogService({
      providers: [provider],
      fileReader: fileReader(JSON.stringify({ platform: "gh" })),
      runner: runner({ stdout: "" }),
      logger: silentLogger,
      now: () => 10,
    });

    const result = await service.detect(ROOT);

    assert.strictEqual(result.ok, true);
    sinon.assert.notCalled(provider.matches);
    sinon.assert.calledOnce(provider.detect);
    const providerContext = provider.detect.firstCall.args[0] as SquadBacklogContext;
    assert.strictEqual(providerContext.source, SquadBacklogDetectionSource.Config);
    assert.strictEqual(providerContext.config.platform, "gh");
    if (result.ok && result.value.status === "detected") {
      assert.strictEqual(result.value.backlog.source, SquadBacklogDetectionSource.Config);
    }
  });

  test("detect returns not-detected when the workspace is not a git repository", async () => {
    const service = new SquadBacklogService({
      providers: [fakeProvider()],
      fileReader: fileReader(null),
      runner: runner({ exitCode: 128, stderr: "fatal: not a git repository" }),
      logger: silentLogger,
      now: () => 15,
    });

    const result = await service.detect(ROOT);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.status, "not-detected");
      if (result.value.status === "not-detected") {
        assert.strictEqual(result.value.reason, SquadBacklogNotDetectedReason.NoGitRepository);
        assert.ok(result.value.remediation);
      }
    }
  });

  test("detect returns not-detected when remotes are unsupported", async () => {
    const provider = fakeProvider({ matches: false });
    const service = new SquadBacklogService({
      providers: [provider],
      fileReader: fileReader(null),
      runner: runner({ stdout: "origin\thttps://example.com/org/repo.git (fetch)\n" }),
      logger: silentLogger,
    });

    const result = await service.detect(ROOT);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.status, "not-detected");
      if (result.value.status === "not-detected") {
        assert.strictEqual(result.value.reason, SquadBacklogNotDetectedReason.UnrecognizedRemote);
      }
    }
  });

  test("detect surfaces malformed config as a parse failure", async () => {
    const service = new SquadBacklogService({
      providers: [fakeProvider()],
      fileReader: fileReader("{"),
      runner: runner({ stdout: "" }),
      logger: silentLogger,
    });

    const result = await service.detect(ROOT);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "parse-failed");
      assert.ok(result.error.remediation);
    }
  });

  test("detect surfaces unsupported configured platforms as actionable errors", async () => {
    const service = new SquadBacklogService({
      providers: [fakeProvider()],
      fileReader: fileReader(JSON.stringify({ platform: "jira" })),
      runner: runner({ stdout: "" }),
      logger: silentLogger,
    });

    const result = await service.detect(ROOT);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backlog-unsupported");
      assert.ok(result.error.remediation);
    }
  });

  test("detect propagates provider failures instead of returning success", async () => {
    const provider = fakeProvider({
      result: squadErr({ code: "backlog-auth-required", message: "auth required", remediation: "login" }),
    });
    const service = new SquadBacklogService({
      providers: [provider],
      fileReader: fileReader(null),
      runner: runner({ stdout: "origin\thttps://github.com/org/repo.git (fetch)\n" }),
      logger: silentLogger,
    });

    const result = await service.detect(ROOT);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "backlog-auth-required");
      assert.strictEqual(result.error.remediation, "login");
    }
  });
});
