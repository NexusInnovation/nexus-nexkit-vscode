export type RepositorySyncPullStrategy = "ff-only" | "rebase" | "merge";

export interface RepositorySyncRepository {
  key: string;
  name: string;
  type: "github" | "local" | "unknown";
  url: string;
  branch: string;
  enabled: boolean;
  isExternal: boolean;
}

export interface RepositorySyncPullResult {
  repository: RepositorySyncRepository;
  success: boolean;
  changed: boolean;
  skipped: boolean;
  reason?: string;
}

export interface RepositorySyncRunResult {
  startedAt: number;
  completedAt: number;
  repositoryCount: number;
  results: RepositorySyncPullResult[];
}

export interface RepositorySyncSettings {
  enabled: boolean;
  autoSyncOnStartup: boolean;
  intervalMinutes: number;
  statusBarEnabled: boolean;
  allowExternalRepositories: boolean;
  pullStrategy: RepositorySyncPullStrategy;
}
