import * as assert from "assert";
import * as sinon from "sinon";
import { RepositorySyncRepository } from "../../src/features/repository-sync/models/repositorySyncModels";
import { RepositoryDiscoveryService } from "../../src/features/repository-sync/services/repositoryDiscoveryService";
import { ExternalRepoTrustService } from "../../src/features/repository-sync/services/externalRepoTrustService";
import { RepositoryPullService } from "../../src/features/repository-sync/services/repositoryPullService";
import { RepositorySyncSchedulerService } from "../../src/features/repository-sync/services/repositorySyncSchedulerService";
import { LoggingService } from "../../src/shared/services/loggingService";
import { TelemetryService } from "../../src/shared/services/telemetryService";
import { SettingsManager } from "../../src/core/settingsManager";

function makeRepo(index: number): RepositorySyncRepository {
  return {
    key: `repo-${index}`,
    name: `Repo ${index}`,
    path: `/tmp/repo-${index}`,
    source: "workspace",
    isExternal: false,
  };
}

suite("Unit: RepositorySyncSchedulerService", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(SettingsManager, "isRepoSyncEnabled").returns(true);
    sandbox.stub(SettingsManager, "getRepoSyncMaxConcurrency").returns(2);
  });

  teardown(() => {
    sandbox.restore();
  });

  test("limits planned repositories to 10 and builds summary", async () => {
    const repositories = Array.from({ length: 12 }, (_, index) => makeRepo(index + 1));
    const discovery = {
      getSyncableRepositories: sandbox.stub().resolves(repositories),
      onDidRefreshSuggested: () => ({ dispose: () => {} }),
      dispose: sandbox.stub(),
    } as unknown as RepositoryDiscoveryService;

    const trust = {
      isRepositoryTrusted: sandbox.stub().resolves(true),
    } as unknown as ExternalRepoTrustService;

    const pull = {
      pullRepository: sandbox.stub().callsFake(async (repo: RepositorySyncRepository) => ({
        repository: repo,
        outcome: { kind: "success-ready" as const },
        success: true,
        changed: true,
        skipped: false,
      })),
    } as unknown as RepositoryPullService;

    const scheduler = new RepositorySyncSchedulerService(
      sandbox.createStubInstance(LoggingService) as unknown as LoggingService,
      { trackEvent: sandbox.stub() } as unknown as TelemetryService,
      discovery,
      pull,
      trust
    );

    const result = await scheduler.runSync();

    assert.strictEqual(result.repositoryCount, 12);
    assert.strictEqual(result.plannedCount, 10);
    assert.strictEqual(result.processedCount, 10);
    assert.strictEqual(result.summary.successReady, 10);
    assert.strictEqual((pull.pullRepository as sinon.SinonStub).callCount, 10);

    scheduler.dispose();
  });

  test("supports retry-failed-only run plan", async () => {
    const repositories = [makeRepo(1), makeRepo(2)];
    const discovery = {
      getSyncableRepositories: sandbox.stub().resolves(repositories),
      onDidRefreshSuggested: () => ({ dispose: () => {} }),
      dispose: sandbox.stub(),
    } as unknown as RepositoryDiscoveryService;

    const trust = {
      isRepositoryTrusted: sandbox.stub().resolves(true),
    } as unknown as ExternalRepoTrustService;

    const pullStub = sandbox.stub();
    pullStub.onFirstCall().resolves({
      repository: repositories[0],
      outcome: { kind: "failed" as const },
      success: false,
      changed: false,
      skipped: false,
    });
    pullStub.onSecondCall().resolves({
      repository: repositories[1],
      outcome: { kind: "success-ready" as const },
      success: true,
      changed: true,
      skipped: false,
    });
    pullStub.onThirdCall().resolves({
      repository: repositories[0],
      outcome: { kind: "success-ready" as const },
      success: true,
      changed: true,
      skipped: false,
    });

    const pull = {
      pullRepository: pullStub,
    } as unknown as RepositoryPullService;

    const scheduler = new RepositorySyncSchedulerService(
      sandbox.createStubInstance(LoggingService) as unknown as LoggingService,
      { trackEvent: sandbox.stub() } as unknown as TelemetryService,
      discovery,
      pull,
      trust
    );

    await scheduler.runSync();
    const retryResult = await scheduler.runSync({ retryFailedOnly: true });

    assert.strictEqual(retryResult.processedCount, 1);
    assert.strictEqual(pullStub.callCount, 3);
    assert.strictEqual(pullStub.getCall(2).args[0].path, repositories[0].path);

    scheduler.dispose();
  });

  test("supports retry for a specific repository path", async () => {
    const repositories = [makeRepo(1), makeRepo(2)];
    const discovery = {
      getSyncableRepositories: sandbox.stub().resolves(repositories),
      onDidRefreshSuggested: () => ({ dispose: () => {} }),
      dispose: sandbox.stub(),
    } as unknown as RepositoryDiscoveryService;

    const trust = {
      isRepositoryTrusted: sandbox.stub().resolves(true),
    } as unknown as ExternalRepoTrustService;

    const pullStub = sandbox.stub().resolves({
      repository: repositories[1],
      outcome: { kind: "success-ready" as const },
      success: true,
      changed: true,
      skipped: false,
    });

    const pull = {
      pullRepository: pullStub,
    } as unknown as RepositoryPullService;

    const scheduler = new RepositorySyncSchedulerService(
      sandbox.createStubInstance(LoggingService) as unknown as LoggingService,
      { trackEvent: sandbox.stub() } as unknown as TelemetryService,
      discovery,
      pull,
      trust
    );

    const result = await scheduler.runSync({
      repositoryPath: repositories[1].path,
      interactiveTrust: true,
      triggerReason: "manual-retry-specific",
    });

    assert.strictEqual(result.processedCount, 1);
    assert.strictEqual(pullStub.callCount, 1);
    assert.strictEqual(pullStub.firstCall.args[0].path, repositories[1].path);

    scheduler.dispose();
  });

  test("queues one pending run when overlap occurs", async () => {
    const repositories = [makeRepo(1)];
    const discovery = {
      getSyncableRepositories: sandbox.stub().resolves(repositories),
      onDidRefreshSuggested: () => ({ dispose: () => {} }),
      dispose: sandbox.stub(),
    } as unknown as RepositoryDiscoveryService;

    const trust = {
      isRepositoryTrusted: sandbox.stub().resolves(true),
    } as unknown as ExternalRepoTrustService;

    let releaseFirstRun: (() => void) | undefined;
    const pullStub = sandbox.stub().callsFake(
      () =>
        new Promise((resolve) => {
          releaseFirstRun = () =>
            resolve({
              repository: repositories[0],
              outcome: { kind: "success-ready" as const },
              success: true,
              changed: true,
              skipped: false,
            });
        })
    );

    const pull = {
      pullRepository: pullStub,
    } as unknown as RepositoryPullService;

    const scheduler = new RepositorySyncSchedulerService(
      sandbox.createStubInstance(LoggingService) as unknown as LoggingService,
      { trackEvent: sandbox.stub() } as unknown as TelemetryService,
      discovery,
      pull,
      trust
    );

    const firstRunPromise = scheduler.runSync();
    await new Promise((resolve) => setImmediate(resolve));
    const overlappingRun = await scheduler.runSync();

    assert.strictEqual(overlappingRun.processedCount, 0);

    assert.ok(releaseFirstRun, "expected first run to be in-flight before release");
    releaseFirstRun?.();
    await firstRunPromise;

    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(pullStub.callCount >= 2);

    scheduler.dispose();
  });
});
