export type RepositorySyncPullStrategy = "ff-only" | "rebase" | "merge";

export type RepositorySyncSource = "workspace" | "external" | "root-scan";

export type RepositorySyncOutcomeKind = "success-ready" | "skipped" | "conflict-risk" | "failed";

export type RepositorySyncTrustDecision = "allow" | "allow-once" | "deny";

export interface RepositorySyncRepository {
  key: string;
  name: string;
  path: string;
  source: RepositorySyncSource;
  isExternal: boolean;
}

export interface RepositorySyncOutcome {
  kind: RepositorySyncOutcomeKind;
  reason?: string;
  suggestedAction?: string;
  branch?: string;
}

export interface RepositorySyncPullResult {
  repository: RepositorySyncRepository;
  outcome: RepositorySyncOutcome;
  success: boolean;
  changed: boolean;
  skipped: boolean;
  reason?: string;
}

export interface RepositorySyncRunSummary {
  total: number;
  successReady: number;
  skipped: number;
  conflictRisk: number;
  failed: number;
  changed: number;
}

export interface RepositorySyncRunResult {
  startedAt: number;
  completedAt: number;
  repositoryCount: number;
  plannedCount: number;
  processedCount: number;
  results: RepositorySyncPullResult[];
  summary: RepositorySyncRunSummary;
}

export interface RepositorySyncRunOptions {
  retryFailedOnly?: boolean;
  interactiveTrust?: boolean;
}

export interface RepositorySyncSettings {
  enabled: boolean;
  autoSyncOnStartup: boolean;
  intervalMinutes: number;
  statusBarEnabled: boolean;
  allowExternalRepositories: boolean;
  pullStrategy: RepositorySyncPullStrategy;
}
