import { SettingsManager } from "../../../core/settingsManager";
import { RepositorySyncRepository } from "../models/repositorySyncModels";

export class ExternalRepoTrustService {
  public isRepositoryTrusted(repository: RepositorySyncRepository): boolean {
    if (!repository.isExternal) {
      return true;
    }

    if (!SettingsManager.isRepoSyncAllowExternalRepositories()) {
      return false;
    }

    return SettingsManager.isRepoSyncExternalRepoTrusted(repository.url);
  }

  public async trustRepository(repository: RepositorySyncRepository): Promise<void> {
    if (!repository.isExternal) {
      return;
    }

    await SettingsManager.setRepoSyncExternalRepoTrusted(repository.url, true);
  }
}
