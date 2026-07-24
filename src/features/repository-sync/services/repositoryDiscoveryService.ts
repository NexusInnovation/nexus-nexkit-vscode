import { SettingsManager } from "../../../core/settingsManager";
import { RepositorySyncRepository } from "../models/repositorySyncModels";

export class RepositoryDiscoveryService {
  public getSyncableRepositories(): RepositorySyncRepository[] {
    const repositories = SettingsManager.getRepositories<{
      name?: string;
      type?: string;
      url?: string;
      branch?: string;
      enabled?: boolean;
    }>();

    return repositories.map((repository, index) => {
      const type = repository.type === "github" || repository.type === "local" ? repository.type : "unknown";
      const url = repository.url ?? "";
      const isExternal = type === "github" || /^https?:\/\//i.test(url);
      return {
        key: `${repository.name ?? "repo"}-${index}`,
        name: repository.name ?? `Repository ${index + 1}`,
        type,
        url,
        branch: repository.branch ?? "main",
        enabled: repository.enabled ?? true,
        isExternal,
      };
    });
  }
}
