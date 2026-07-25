import * as vscode from "vscode";
import { SettingsManager } from "../../../core/settingsManager";
import { LoggingService } from "../../../shared/services/loggingService";
import { TelemetryService } from "../../../shared/services/telemetryService";
import {
  RepositorySyncPullResult,
  RepositorySyncRepository,
  RepositorySyncRunOptions,
  RepositorySyncRunResult,
} from "../models/repositorySyncModels";
import { RepositoryDiscoveryService } from "./repositoryDiscoveryService";
import { RepositoryPullService } from "./repositoryPullService";
import { ExternalRepoTrustService } from "./externalRepoTrustService";

export class RepositorySyncSchedulerService implements vscode.Disposable {
  private readonly _logging: LoggingService;
  private readonly _telemetry: TelemetryService;
  private readonly _discovery: RepositoryDiscoveryService;
  private readonly _pull: RepositoryPullService;
  private readonly _trust: ExternalRepoTrustService;
  private _timer: NodeJS.Timeout | undefined;
  private _isRunning = false;
  private _hasPendingRun = false;
  private _pendingRunOptions: RepositorySyncRunOptions | undefined;
  private _lastResultsByRepositoryPath = new Map<string, RepositorySyncPullResult>();
  private readonly _discoveryRefreshDisposable: vscode.Disposable;

  public constructor(
    logging: LoggingService,
    telemetry: TelemetryService,
    discovery: RepositoryDiscoveryService,
    pull: RepositoryPullService,
    trust: ExternalRepoTrustService
  ) {
    this._logging = logging;
    this._telemetry = telemetry;
    this._discovery = discovery;
    this._pull = pull;
    this._trust = trust;
    this._discoveryRefreshDisposable = this._discovery.onDidRefreshSuggested(() => {
      void this.runSync();
    });
  }

  public start(): void {
    this.stop();

    if (!SettingsManager.isRepoSyncEnabled()) {
      this._logging.info("Repository sync scheduler disabled by settings");
      return;
    }

    const intervalMinutes = SettingsManager.getRepoSyncIntervalMinutes();
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

    this._timer = setInterval(() => {
      void this.runSync();
    }, intervalMs);

    this._logging.info("Repository sync scheduler started", { intervalMinutes });
  }

  public stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
      this._logging.info("Repository sync scheduler stopped");
    }
  }

  public async runSync(options?: RepositorySyncRunOptions): Promise<RepositorySyncRunResult> {
    if (!SettingsManager.isRepoSyncEnabled()) {
      this._logging.info("Repository sync run skipped because feature is disabled.");
      return this._buildNoOpResult();
    }

    if (this._isRunning) {
      this._hasPendingRun = true;
      this._pendingRunOptions = options;
      this._logging.info("Repository sync run already in progress; queued one pending run.");
      return this._buildNoOpResult();
    }

    this._isRunning = true;
    const startedAt = Date.now();
    try {
      const repositories = await this._discovery.getSyncableRepositories();
      const planned = repositories.slice(0, 10);
      const trustAllowed = await this._applyTrustFilter(planned, options?.interactiveTrust ?? true);
      const runPlan = this._buildRunPlan(
        trustAllowed,
        options?.retryFailedOnly ?? false,
        options?.repositoryPath
      );
      const maxConcurrency = Math.min(3, Math.max(2, SettingsManager.getRepoSyncMaxConcurrency()));
      const triggerReason = options?.triggerReason ?? "unspecified";

      this._logging.info("Repository sync run started", {
        discovered: repositories.length,
        planned: planned.length,
        executing: runPlan.length,
        retryFailedOnly: options?.retryFailedOnly ?? false,
        repositoryPath: options?.repositoryPath,
        triggerReason,
        maxConcurrency,
      });

      const results = await this._runWithConcurrency(runPlan, maxConcurrency);

      for (const result of results) {
        this._lastResultsByRepositoryPath.set(result.repository.path, result);
        this._logging.info("Repository sync per-repository outcome", {
          repository: result.repository.name,
          path: result.repository.path,
          outcome: result.outcome.kind,
          reason: result.reason,
          suggestedAction: result.outcome.suggestedAction,
        });

        if (result.outcome.kind === "conflict-risk") {
          this._logging.warn("Repository sync conflict risk detected", {
            repository: result.repository.name,
            path: result.repository.path,
            guidance: result.outcome.suggestedAction ?? "Resolve conflict risk manually before next run.",
          });
        }
      }

      const runResult = this._buildRunResult(startedAt, repositories.length, planned.length, results);

      this._telemetry.trackEvent("repositorySync.run", {
        repositoryCount: String(runResult.repositoryCount),
        plannedCount: String(runResult.plannedCount),
        processedCount: String(runResult.processedCount),
        successReadyCount: String(runResult.summary.successReady),
        skippedCount: String(runResult.summary.skipped),
        conflictRiskCount: String(runResult.summary.conflictRisk),
        failedCount: String(runResult.summary.failed),
        triggerReason,
      });

      this._logging.info("Repository sync run completed", {
        durationMs: runResult.completedAt - runResult.startedAt,
        summary: runResult.summary,
      });

      return runResult;
    } finally {
      this._isRunning = false;
      if (this._hasPendingRun) {
        this._hasPendingRun = false;
        const pendingRunOptions = this._pendingRunOptions;
        this._pendingRunOptions = undefined;
        void this.runSync({
          ...pendingRunOptions,
          interactiveTrust: false,
        });
      }
    }
  }

  public dispose(): void {
    this.stop();
    this._discoveryRefreshDisposable.dispose();
    this._discovery.dispose();
  }

  private async _applyTrustFilter(
    repositories: RepositorySyncRepository[],
    interactiveTrust: boolean
  ): Promise<RepositorySyncRepository[]> {
    const allowed: RepositorySyncRepository[] = [];
    for (const repository of repositories) {
      const trusted = await this._trust.isRepositoryTrusted(repository, {
        interactive: interactiveTrust,
      });
      if (trusted) {
        allowed.push(repository);
      } else {
        this._logging.warn("Repository skipped due to trust policy", {
          repository: repository.name,
          path: repository.path,
          source: repository.source,
        });
      }
    }

    return allowed;
  }

  private _buildRunPlan(
    repositories: RepositorySyncRepository[],
    retryFailedOnly: boolean,
    repositoryPath?: string
  ): RepositorySyncRepository[] {
    let runPlan = repositories;

    if (retryFailedOnly) {
      runPlan = runPlan.filter((repository) => {
        const previous = this._lastResultsByRepositoryPath.get(repository.path);
        return previous ? previous.outcome.kind === "failed" : false;
      });
    }

    const requestedRepositoryPath = repositoryPath;
    if (!requestedRepositoryPath) {
      return runPlan;
    }

    return runPlan.filter((repository) => repository.path === requestedRepositoryPath);
  }

  private async _runWithConcurrency(
    repositories: RepositorySyncRepository[],
    maxConcurrency: number
  ): Promise<RepositorySyncPullResult[]> {
    const queue = [...repositories];
    const results: RepositorySyncPullResult[] = [];
    const workerCount = Math.max(1, Math.min(maxConcurrency, queue.length || 1));

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const repository = queue.shift();
          if (!repository) {
            continue;
          }

          const result = await this._pull.pullRepository(repository);
          results.push(result);
        }
      })
    );

    return results;
  }

  private _buildRunResult(
    startedAt: number,
    repositoryCount: number,
    plannedCount: number,
    results: RepositorySyncPullResult[]
  ): RepositorySyncRunResult {
    const summary = {
      total: results.length,
      successReady: results.filter((result) => result.outcome.kind === "success-ready").length,
      skipped: results.filter((result) => result.outcome.kind === "skipped").length,
      conflictRisk: results.filter((result) => result.outcome.kind === "conflict-risk").length,
      failed: results.filter((result) => result.outcome.kind === "failed").length,
      changed: results.filter((result) => result.changed).length,
    };

    return {
      startedAt,
      completedAt: Date.now(),
      repositoryCount,
      plannedCount,
      processedCount: results.length,
      results,
      summary,
    };
  }

  private _buildNoOpResult(): RepositorySyncRunResult {
    const now = Date.now();
    return {
      startedAt: now,
      completedAt: now,
      repositoryCount: 0,
      plannedCount: 0,
      processedCount: 0,
      results: [],
      summary: {
        total: 0,
        successReady: 0,
        skipped: 0,
        conflictRisk: 0,
        failed: 0,
        changed: 0,
      },
    };
  }
}
