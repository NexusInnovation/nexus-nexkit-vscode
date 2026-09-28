import * as assert from "assert";
import * as vscode from "vscode";
import {
  NpmSquadLatestVersionProvider,
  SquadLatestVersionProvider,
  SquadUpdateDetectionProvider,
  SquadUpdateFetchResponse,
  SquadUpdateService,
} from "../../src/features/squad/services/squadUpdateService";
import {
  SquadDetectionResult,
  SquadInstallState,
  SquadUpdateTarget,
  SquadUpgradeCommand,
  SquadVersionStatus,
  isSquadErr,
  isSquadOk,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

const ROOT = vscode.Uri.file("/tmp/workspace");

function detectionResult(): SquadDetectionResult {
  return {
    project: {
      installState: SquadInstallState.Installed,
      markers: {
        ".squad/config.json": true,
        ".squad/team.md": true,
        ".github/agents/squad.agent.md": true,
      },
      projectVersion: "1.0.0",
      versionStatus: SquadVersionStatus.Unknown,
    },
    cli: {
      installed: true,
      source: "global",
      cliVersion: "1.0.0",
      versionStatus: SquadVersionStatus.Unknown,
    },
    detectedAt: 10,
  };
}

function detectionProvider(result: SquadDetectionResult): SquadUpdateDetectionProvider {
  return {
    async detect(): Promise<ReturnType<typeof squadOk<SquadDetectionResult>>> {
      return squadOk(result);
    },
  };
}

function latestProvider(cliVersion: string, projectVersion = cliVersion): SquadLatestVersionProvider {
  return {
    async getLatestCliVersion() {
      return squadOk(cliVersion);
    },
    async getLatestProjectVersion() {
      return squadOk(projectVersion);
    },
  };
}

function response(status: number, payload: unknown, headers: Record<string, string> = {}): SquadUpdateFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: {
      get(name: string): string | null {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    async json(): Promise<unknown> {
      return payload;
    },
  };
}

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

suite("Unit: SquadUpdateService (SQD-030)", () => {
  test("Should report CLI and project updates with reusable upgrade contracts", async () => {
    const service = new SquadUpdateService({
      detectionService: detectionProvider(detectionResult()),
      latestVersionProvider: latestProvider("1.2.0"),
      logger: silentLogger,
      now: () => 123,
    });

    const result = await service.checkUpdates(ROOT);

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.checkedAt, 123);
    assert.strictEqual(result.value.detection.cli.versionStatus, SquadVersionStatus.UpdateAvailable);
    assert.strictEqual(result.value.detection.project.versionStatus, SquadVersionStatus.UpdateAvailable);
    assert.strictEqual(result.value.cli.target, SquadUpdateTarget.Cli);
    assert.strictEqual(result.value.cli.updateAvailable, true);
    assert.strictEqual(result.value.cli.upgradeCommand, SquadUpgradeCommand.CliSelf);
    assert.strictEqual(result.value.cli.requiresConfirmation, true);
    assert.strictEqual(result.value.cli.requiresBackup, false);
    assert.strictEqual(result.value.project.target, SquadUpdateTarget.Project);
    assert.strictEqual(result.value.project.updateAvailable, true);
    assert.strictEqual(result.value.project.upgradeCommand, SquadUpgradeCommand.Project);
    assert.strictEqual(result.value.project.requiresConfirmation, true);
    assert.strictEqual(result.value.project.requiresBackup, true);
  });

  test("Should report up-to-date when current versions match latest versions", async () => {
    const service = new SquadUpdateService({
      detectionService: detectionProvider(detectionResult()),
      latestVersionProvider: latestProvider("1.0.0"),
      logger: silentLogger,
    });

    const result = await service.checkUpdates(ROOT);

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.cli.status, SquadVersionStatus.UpToDate);
    assert.strictEqual(result.value.cli.updateAvailable, false);
    assert.strictEqual(result.value.project.status, SquadVersionStatus.UpToDate);
    assert.strictEqual(result.value.project.updateAvailable, false);
  });

  test("Should not produce a success-shaped update when the CLI is absent", async () => {
    const detection = detectionResult();
    detection.cli = {
      installed: false,
      cliVersion: null,
      versionStatus: SquadVersionStatus.Unknown,
    };
    const service = new SquadUpdateService({
      detectionService: detectionProvider(detection),
      latestVersionProvider: latestProvider("1.2.0"),
      logger: silentLogger,
    });

    const result = await service.checkUpdates(ROOT);

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.cli.status, SquadVersionStatus.Unknown);
    assert.strictEqual(result.value.cli.updateAvailable, false);
    assert.strictEqual(result.value.cli.currentVersion, null);
    assert.ok(result.value.cli.message.includes("unknown"));
  });

  test("Should keep source project versions unknown instead of offering project upgrade", async () => {
    const detection = detectionResult();
    detection.project.projectVersion = "0.0.0-source";
    const service = new SquadUpdateService({
      detectionService: detectionProvider(detection),
      latestVersionProvider: latestProvider("1.2.0"),
      logger: silentLogger,
    });

    const result = await service.checkUpdates(ROOT);

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.project.status, SquadVersionStatus.Unknown);
    assert.strictEqual(result.value.project.updateAvailable, false);
  });

  test("Should surface latest-version lookup failures as actionable errors", async () => {
    const latest: SquadLatestVersionProvider = {
      async getLatestCliVersion() {
        return squadErr({
          code: "update-check-failed",
          message: "offline",
          remediation: "connect",
        });
      },
      async getLatestProjectVersion() {
        return squadOk("1.2.0");
      },
    };
    const service = new SquadUpdateService({
      detectionService: detectionProvider(detectionResult()),
      latestVersionProvider: latest,
      logger: silentLogger,
    });

    const result = await service.checkUpdates(ROOT);

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "update-check-failed");
    assert.ok(result.error.remediation);
  });

  test("Npm provider should fetch latest package version with a User-Agent", async () => {
    let requestedUrl = "";
    let requestedUserAgent = "";
    const provider = new NpmSquadLatestVersionProvider({
      logger: silentLogger,
      userAgent: "test-agent",
      fetchFn: async (url, init) => {
        requestedUrl = url;
        requestedUserAgent = init?.headers?.["User-Agent"] ?? "";
        return response(200, { version: "2.3.4" });
      },
    });

    const result = await provider.getLatestCliVersion();

    assert.ok(isSquadOk(result));
    assert.match(requestedUrl, /registry\.npmjs\.org/);
    assert.strictEqual(requestedUserAgent, "test-agent");
    assert.strictEqual(result.value, "2.3.4");
  });

  test("Npm provider should map rate-limit responses to update-check-failed", async () => {
    const provider = new NpmSquadLatestVersionProvider({
      logger: silentLogger,
      fetchFn: async () => response(429, {}, { "x-ratelimit-remaining": "0" }),
    });

    const result = await provider.getLatestProjectVersion();

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "update-check-failed");
    assert.match(result.error.remediation ?? "", /rate limit/i);
  });

  test("Npm provider should retry after a transient latest-version failure", async () => {
    let calls = 0;
    const provider = new NpmSquadLatestVersionProvider({
      logger: silentLogger,
      fetchFn: async () => {
        calls += 1;
        return calls === 1 ? response(500, {}) : response(200, { version: "2.0.0" });
      },
    });

    const first = await provider.getLatestCliVersion();
    const second = await provider.getLatestCliVersion();

    assert.ok(isSquadErr(first));
    assert.ok(isSquadOk(second));
    assert.strictEqual(second.value, "2.0.0");
    assert.strictEqual(calls, 2);
  });
});
