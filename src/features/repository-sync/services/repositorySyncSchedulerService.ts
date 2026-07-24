import * as vscode from "vscode";
import { SettingsManager } from "../../../core/settingsManager";
import { LoggingService } from "../../../shared/services/loggingService";
import { TelemetryService } from "../../../shared/services/telemetryService";
import { RepositorySyncRunResult } from "../models/repositorySyncModels";
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

  public async runSync(): Promise<RepositorySyncRunResult> {
    const startedAt = Date.now();
    const repositories = this._discovery.getSyncableRepositories().filter((repository) => repository.enabled);
    const allowedRepositories = repositories.filter((repository) => this._trust.isRepositoryTrusted(repository));

    const results = await Promise.all(allowedRepositories.map((repository) => this._pull.pullRepository(repository)));

    const runResult: RepositorySyncRunResult = {
      startedAt,
      completedAt: Date.now(),
      repositoryCount: repositories.length,
      results,
    };

    this._telemetry.trackEvent("repositorySync.run", {
      repositoryCount: String(runResult.repositoryCount),
      processedCount: String(results.length),
    });

    return runResult;
  }

  public dispose(): void {
    this.stop();
  }
}
