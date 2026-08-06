import * as vscode from "vscode";
import * as path from "path";
import { LoggingService } from "../../shared/services/loggingService";
import { TelemetryService } from "../../shared/services/telemetryService";
import { Commands } from "../../shared/constants/commands";
import { DevOpsMcpConfigService } from "../apm-devops/devOpsMcpConfigService";
import { parseAzureReposGitRemoteUrl } from "../apm-devops/devOpsUrlParser";
import { AzureDevOpsRestClient } from "./azureDevOpsRestClient";
import { buildBranchName } from "./branchNameBuilder";
import { ResolvedDevOpsTarget } from "./models/resolvedDevOpsTarget";

/**
 * Minimal type definitions for the VS Code Git Extension API needed by this feature.
 */
interface GitRemote {
  readonly name: string;
  readonly fetchUrl?: string;
}

interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: {
    remotes: GitRemote[];
  };
  getBranch(name: string): Promise<{ name?: string }>;
  createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
  checkout(treeish: string): Promise<void>;
}

interface GitExtensionAPI {
  repositories: GitRepository[];
}

/**
 * Orchestrates creating (and checking out) a local git branch from an Azure DevOps work item.
 */
export class DevOpsBranchCreationService {
  private readonly _logging = LoggingService.getInstance();

  constructor(
    private readonly _devOpsConfig: DevOpsMcpConfigService,
    private readonly _restClient: AzureDevOpsRestClient,
    private readonly _telemetry: TelemetryService
  ) {}

  async createBranchFromWorkItem(triggerSource: "palette" | "panel"): Promise<void> {
    const workItemIdInput = await vscode.window.showInputBox({
      prompt: "ID de l'élément de travail Azure DevOps",
      placeHolder: "1234",
      validateInput: (value) => (/^\d+$/.test(value.trim()) ? undefined : "Veuillez entrer un identifiant numérique valide."),
    });

    if (!workItemIdInput) {
      this._trackCancelled("userCancelled");
      return;
    }

    const repo = await this._resolveRepository();
    if (!repo) {
      return;
    }

    const target = await this._resolveTarget(repo);
    if (!target) {
      return;
    }

    const workItemId = Number.parseInt(workItemIdInput.trim(), 10);

    try {
      const workItem = await this._restClient.getWorkItem(target.organization, workItemId);
      const branchName = buildBranchName(workItem);

      if (await this._branchExists(repo, branchName)) {
        const choice = await vscode.window.showWarningMessage(
          `Nexkit: La branche "${branchName}" existe déjà.`,
          "Basculer dessus",
          "Annuler"
        );

        if (choice !== "Basculer dessus") {
          this._trackCancelled("branchExistsCancelled");
          return;
        }

        await repo.checkout(branchName);
        vscode.window.showInformationMessage(`Nexkit: Basculé sur la branche existante "${branchName}".`);
      } else {
        await repo.createBranch(branchName, true);
        vscode.window.showInformationMessage(`Nexkit: Branche "${branchName}" créée et extraite (checkout).`);
      }

      this._telemetry.trackEvent("devops.branch.created", {
        workItemType: workItem.type,
        resolutionSource: target.resolutionSource,
        triggerSource,
        organization: target.organization,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._logging.error("Failed to create branch from work item", error);
      this._telemetry.trackError(error instanceof Error ? error : new Error(message), {
        context: "devOpsBranchCreation.createBranchFromWorkItem",
      });
      vscode.window.showErrorMessage(`Nexkit: ${message}`);
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async _resolveRepository(): Promise<GitRepository | undefined> {
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports as
      | { getAPI(version: 1): GitExtensionAPI }
      | undefined;

    if (!gitExtension) {
      this._logging.warn("Git extension not found");
      vscode.window.showErrorMessage("Nexkit: Extension Git introuvable. Veuillez vous assurer que l'extension Git intégrée est activée.");
      return undefined;
    }

    const git = gitExtension.getAPI(1);
    const repos = git.repositories;

    if (!repos || repos.length === 0) {
      this._logging.warn("No Git repository found in the current workspace");
      vscode.window.showErrorMessage("Nexkit: Aucun dépôt Git trouvé dans l'espace de travail actuel.");
      return undefined;
    }

    if (repos.length === 1) {
      return repos[0];
    }

    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
      const matching = repos.find((repo) => activeUri.fsPath.startsWith(repo.rootUri.fsPath));
      if (matching) {
        return matching;
      }
    }

    const items = repos.map((repo) => ({
      label: path.basename(repo.rootUri.fsPath),
      description: repo.rootUri.fsPath,
      repository: repo,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Sélectionnez le dépôt Git",
      title: "Créer une branche depuis un élément de travail Azure DevOps",
    });

    if (!selected) {
      this._trackCancelled("userCancelled");
      return undefined;
    }

    return selected.repository;
  }

  private async _resolveTarget(repo: GitRepository): Promise<ResolvedDevOpsTarget | undefined> {
    const originRemote = repo.state.remotes.find((remote) => remote.name === "origin");
    if (originRemote?.fetchUrl) {
      const parsed = parseAzureReposGitRemoteUrl(originRemote.fetchUrl);
      if (parsed.isAzureRepos && parsed.organization) {
        return { organization: parsed.organization, project: parsed.project, resolutionSource: "gitRemote" };
      }
    }

    const connections = await this._devOpsConfig.getConnections();

    if (connections.length === 0) {
      const choice = await vscode.window.showErrorMessage(
        "Nexkit: Aucune connexion Azure DevOps configurée. Ajoutez une connexion pour continuer.",
        "Ajouter une connexion"
      );
      if (choice === "Ajouter une connexion") {
        await vscode.commands.executeCommand(Commands.ADD_DEVOPS_CONNECTION);
      }
      return undefined;
    }

    if (connections.length === 1) {
      return { organization: connections[0].organization, project: connections[0].project, resolutionSource: "activeConnection" };
    }

    const activeConnections = connections.filter((connection) => connection.isActive);
    if (activeConnections.length === 1) {
      return {
        organization: activeConnections[0].organization,
        project: activeConnections[0].project,
        resolutionSource: "activeConnection",
      };
    }

    const items = connections.map((connection) => ({
      label: `${connection.organization}/${connection.project}`,
      description: connection.isActive ? "Active" : undefined,
      connection,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Sélectionnez une connexion Azure DevOps",
      title: "Créer une branche depuis un élément de travail Azure DevOps",
    });

    if (!selected) {
      this._trackCancelled("userCancelled");
      return undefined;
    }

    return {
      organization: selected.connection.organization,
      project: selected.connection.project,
      resolutionSource: "pickedConnection",
    };
  }

  private async _branchExists(repo: GitRepository, branchName: string): Promise<boolean> {
    try {
      await repo.getBranch(branchName);
      return true;
    } catch {
      return false;
    }
  }

  private _trackCancelled(reason: "userCancelled" | "branchExistsCancelled"): void {
    this._telemetry.trackEvent("devops.branch.cancelled", { reason });
  }
}
