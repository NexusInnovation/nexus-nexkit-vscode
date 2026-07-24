import { LoggingService } from "../../../shared/services/loggingService";
import { RepositorySyncPullResult, RepositorySyncRepository } from "../models/repositorySyncModels";

export class RepositoryPullService {
  private readonly _logging: LoggingService;

  public constructor(logging: LoggingService) {
    this._logging = logging;
  }

  public async pullRepository(repository: RepositorySyncRepository): Promise<RepositorySyncPullResult> {
    this._logging.info("Repository sync scaffold pull requested", {
      repository: repository.name,
      strategy: "placeholder",
    });

    return {
      repository,
      success: true,
      changed: false,
      skipped: true,
      reason: "Repository pull is not implemented yet.",
    };
  }
}
