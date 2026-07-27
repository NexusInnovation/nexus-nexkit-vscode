import * as vscode from "vscode";
import { SettingsManager } from "../../../core/settingsManager";
import { RepositorySyncRepository, RepositorySyncTrustDecision } from "../models/repositorySyncModels";

export interface RepositoryTrustEvaluationOptions {
  interactive?: boolean;
}

export class ExternalRepoTrustService {
  public async isRepositoryTrusted(
    repository: RepositorySyncRepository,
    options?: RepositoryTrustEvaluationOptions
  ): Promise<boolean> {
    if (!repository.isExternal) {
      return true;
    }

    if (!SettingsManager.isRepoSyncAllowExternalRepositories()) {
      return false;
    }

    if (SettingsManager.isRepoSyncExternalRepoTrusted(repository.path)) {
      return true;
    }

    if (SettingsManager.isRepoSyncExternalRepoDenied(repository.path)) {
      return false;
    }

    if (!options?.interactive) {
      return false;
    }

    const decision = await this._promptTrustDecision(repository);
    return this._applyTrustDecision(repository, decision);
  }

  public async trustRepository(repository: RepositorySyncRepository): Promise<void> {
    if (!repository.isExternal) {
      return;
    }

    await SettingsManager.setRepoSyncExternalRepoTrusted(repository.path, true);
  }

  private async _promptTrustDecision(repository: RepositorySyncRepository): Promise<RepositorySyncTrustDecision> {
    const allow = "Allow";
    const allowOnce = "Allow Once";
    const deny = "Deny";

    const response = await vscode.window.showWarningMessage(
      `Nexkit repository sync found external repository '${repository.name}'. Allow processing?`,
      { modal: true },
      allow,
      allowOnce,
      deny
    );

    if (response === allow) {
      return "allow";
    }

    if (response === allowOnce) {
      return "allow-once";
    }

    return "deny";
  }

  private async _applyTrustDecision(
    repository: RepositorySyncRepository,
    decision: RepositorySyncTrustDecision
  ): Promise<boolean> {
    if (decision === "allow") {
      await SettingsManager.setRepoSyncExternalRepoTrusted(repository.path, true);
      return true;
    }

    if (decision === "allow-once") {
      return true;
    }

    await SettingsManager.setRepoSyncExternalRepoDenied(repository.path, true);
    return false;
  }

  public async denyRepository(repository: RepositorySyncRepository): Promise<void> {
    if (!repository.isExternal) {
      return;
    }

    await SettingsManager.setRepoSyncExternalRepoDenied(repository.path, true);
  }
}
