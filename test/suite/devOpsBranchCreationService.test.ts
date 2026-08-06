/**
 * Integration-style tests for DevOpsBranchCreationService.
 * Mocks the Git extension API, DevOpsMcpConfigService, and AzureDevOpsRestClient —
 * never touches a real git repository or Azure DevOps.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { DevOpsBranchCreationService } from "../../src/features/devops-branch-creation/devOpsBranchCreationService";
import { DevOpsMcpConfigService } from "../../src/features/apm-devops/devOpsMcpConfigService";
import { AzureDevOpsRestClient } from "../../src/features/devops-branch-creation/azureDevOpsRestClient";
import { TelemetryService } from "../../src/shared/services/telemetryService";
import { DevOpsConnection } from "../../src/features/apm-devops/models/devOpsConnection";
import { AzureDevOpsWorkItem } from "../../src/features/devops-branch-creation/models/azureDevOpsWorkItem";

function connection(overrides: Partial<DevOpsConnection>): DevOpsConnection {
  return { id: "org-proj", organization: "org", project: "proj", isActive: false, serverName: "", ...overrides };
}

function workItem(overrides: Partial<AzureDevOpsWorkItem> = {}): AzureDevOpsWorkItem {
  return { id: 42, type: "Bug", title: "Fix the login button", organization: "org", ...overrides };
}

function createRepo(rootPath: string, remotes: { name: string; fetchUrl?: string }[] = []) {
  return {
    rootUri: vscode.Uri.file(rootPath),
    state: { remotes },
    getBranch: sinon.stub().rejects(new Error("Branch not found")),
    createBranch: sinon.stub().resolves(),
    checkout: sinon.stub().resolves(),
  };
}

suite("Integration: DevOpsBranchCreationService – Create Branch from Work Item", () => {
  let sandbox: sinon.SinonSandbox;
  let showInputBoxStub: sinon.SinonStub;
  let showQuickPickStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  let getExtensionStub: sinon.SinonStub;
  let devOpsConfig: { getConnections: sinon.SinonStub; setActiveConnection: sinon.SinonStub };
  let restClient: { getWorkItem: sinon.SinonStub };
  let telemetry: { trackEvent: sinon.SinonStub; trackError: sinon.SinonStub };
  let service: DevOpsBranchCreationService;

  setup(() => {
    sandbox = sinon.createSandbox();

    showInputBoxStub = sandbox.stub(vscode.window, "showInputBox").resolves("1234");
    showQuickPickStub = sandbox.stub(vscode.window, "showQuickPick");
    showWarningMessageStub = sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
    showErrorMessageStub = sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
    showInformationMessageStub = sandbox.stub(vscode.window, "showInformationMessage").resolves(undefined);
    executeCommandStub = sandbox.stub(vscode.commands, "executeCommand").resolves();
    getExtensionStub = sandbox.stub(vscode.extensions, "getExtension");

    devOpsConfig = { getConnections: sandbox.stub().resolves([]), setActiveConnection: sandbox.stub().resolves() };
    restClient = { getWorkItem: sandbox.stub().resolves(workItem()) };
    telemetry = { trackEvent: sandbox.stub(), trackError: sandbox.stub() };

    service = new DevOpsBranchCreationService(
      devOpsConfig as unknown as DevOpsMcpConfigService,
      restClient as unknown as AzureDevOpsRestClient,
      telemetry as unknown as TelemetryService
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  function stubGit(repos: ReturnType<typeof createRepo>[]): void {
    getExtensionStub.withArgs("vscode.git").returns({
      exports: { getAPI: (_v: number) => ({ repositories: repos }) },
    } as any);
  }

  test("Should resolve organization from an Azure Repos origin remote", async () => {
    const repo = createRepo("/repo", [{ name: "origin", fetchUrl: "https://dev.azure.com/myorg/myproject/_git/myrepo" }]);
    stubGit([repo]);

    await service.createBranchFromWorkItem("palette");

    assert.ok(devOpsConfig.getConnections.notCalled, "should not fall back to connections when git remote resolves");
    assert.ok(restClient.getWorkItem.calledOnceWith("myorg", 1234));
    assert.ok(repo.createBranch.calledOnceWith("bugfix/42-fix-the-login-button", true));
    assert.ok(
      telemetry.trackEvent.calledWith("devops.branch.created", {
        workItemType: "Bug",
        resolutionSource: "gitRemote",
        triggerSource: "palette",
        organization: "myorg",
      })
    );
  });

  test("Should show an 'add connection' error when no connections exist and no git remote resolves", async () => {
    const repo = createRepo("/repo", []);
    stubGit([repo]);
    devOpsConfig.getConnections.resolves([]);
    showErrorMessageStub.resolves("Ajouter une connexion");

    await service.createBranchFromWorkItem("palette");

    assert.ok(restClient.getWorkItem.notCalled);
    assert.ok(executeCommandStub.calledWith("nexus-nexkit-vscode.addDevOpsConnection"));
  });

  test("Should use the single configured connection without prompting", async () => {
    const repo = createRepo("/repo", []);
    stubGit([repo]);
    devOpsConfig.getConnections.resolves([connection({ organization: "onlyorg", project: "onlyproj", isActive: true })]);

    await service.createBranchFromWorkItem("palette");

    assert.ok(showQuickPickStub.notCalled);
    assert.ok(restClient.getWorkItem.calledOnceWith("onlyorg", 1234));
    assert.ok(
      telemetry.trackEvent.calledWith(
        "devops.branch.created",
        sinon.match({ resolutionSource: "activeConnection", organization: "onlyorg" })
      )
    );
  });

  test("Should activate the single configured connection when it is not already active", async () => {
    const repo = createRepo("/repo", []);
    stubGit([repo]);
    devOpsConfig.getConnections.resolves([
      connection({ id: "onlyorg-onlyproj", organization: "onlyorg", project: "onlyproj", isActive: false }),
    ]);

    await service.createBranchFromWorkItem("palette");

    assert.ok(devOpsConfig.setActiveConnection.calledOnceWith("onlyorg-onlyproj"));
    assert.ok(
      telemetry.trackEvent.calledWith(
        "devops.branch.created",
        sinon.match({ resolutionSource: "activeConnection", organization: "onlyorg" })
      )
    );
  });

  test("Should not re-activate the single configured connection when it is already active", async () => {
    const repo = createRepo("/repo", []);
    stubGit([repo]);
    devOpsConfig.getConnections.resolves([connection({ organization: "onlyorg", project: "onlyproj", isActive: true })]);

    await service.createBranchFromWorkItem("palette");

    assert.ok(devOpsConfig.setActiveConnection.notCalled);
  });

  test("Should still resolve the target when activating the sole connection fails", async () => {
    const repo = createRepo("/repo", []);
    stubGit([repo]);
    devOpsConfig.getConnections.resolves([
      connection({ id: "onlyorg-onlyproj", organization: "onlyorg", project: "onlyproj", isActive: false }),
    ]);
    devOpsConfig.setActiveConnection.rejects(new Error("mcp.json write failed"));

    await service.createBranchFromWorkItem("palette");

    assert.ok(devOpsConfig.setActiveConnection.calledOnceWith("onlyorg-onlyproj"));
    assert.ok(restClient.getWorkItem.calledOnceWith("onlyorg", 1234));
    assert.ok(
      telemetry.trackEvent.calledWith(
        "devops.branch.created",
        sinon.match({ resolutionSource: "activeConnection", organization: "onlyorg" })
      )
    );
  });

  test("Should prompt via QuickPick when multiple ambiguous connections exist", async () => {
    const repo = createRepo("/repo", []);
    stubGit([repo]);
    const connA = connection({ id: "a", organization: "orgA", project: "projA", isActive: false });
    const connB = connection({ id: "b", organization: "orgB", project: "projB", isActive: false });
    devOpsConfig.getConnections.resolves([connA, connB]);
    showQuickPickStub.callsFake(async (items: any[]) => items.find((i) => i.connection.id === "b"));

    await service.createBranchFromWorkItem("palette");

    assert.ok(showQuickPickStub.calledOnce);
    assert.ok(restClient.getWorkItem.calledOnceWith("orgB", 1234));
    assert.ok(
      telemetry.trackEvent.calledWith(
        "devops.branch.created",
        sinon.match({ resolutionSource: "pickedConnection", organization: "orgB" })
      )
    );
  });

  test("Should checkout the existing branch when the user confirms on collision", async () => {
    const repo = createRepo("/repo", [{ name: "origin", fetchUrl: "https://dev.azure.com/myorg/myproject/_git/myrepo" }]);
    repo.getBranch.resolves({ name: "bugfix/42-fix-the-login-button" });
    stubGit([repo]);
    showWarningMessageStub.resolves("Basculer dessus");

    await service.createBranchFromWorkItem("palette");

    assert.ok(repo.checkout.calledOnceWith("bugfix/42-fix-the-login-button"));
    assert.ok(repo.createBranch.notCalled);
    assert.ok(telemetry.trackEvent.calledWith("devops.branch.created", sinon.match.any));
  });

  test("Should cancel without creating a branch when the user declines on collision", async () => {
    const repo = createRepo("/repo", [{ name: "origin", fetchUrl: "https://dev.azure.com/myorg/myproject/_git/myrepo" }]);
    repo.getBranch.resolves({ name: "bugfix/42-fix-the-login-button" });
    stubGit([repo]);
    showWarningMessageStub.resolves("Annuler");

    await service.createBranchFromWorkItem("palette");

    assert.ok(repo.checkout.notCalled);
    assert.ok(repo.createBranch.notCalled);
    assert.ok(telemetry.trackEvent.calledWith("devops.branch.cancelled", { reason: "branchExistsCancelled" }));
  });

  test("Should cancel when the user dismisses the work item ID input box", async () => {
    showInputBoxStub.resolves(undefined);

    await service.createBranchFromWorkItem("palette");

    assert.ok(devOpsConfig.getConnections.notCalled);
    assert.ok(telemetry.trackEvent.calledWith("devops.branch.cancelled", { reason: "userCancelled" }));
  });

  test("Should surface a REST client error via showErrorMessage and telemetry.trackError", async () => {
    const repo = createRepo("/repo", [{ name: "origin", fetchUrl: "https://dev.azure.com/myorg/myproject/_git/myrepo" }]);
    stubGit([repo]);
    restClient.getWorkItem.rejects(new Error("Élément de travail introuvable"));

    await service.createBranchFromWorkItem("palette");

    assert.ok(repo.createBranch.notCalled);
    assert.ok(telemetry.trackError.calledOnce);
    assert.ok(showErrorMessageStub.calledWithMatch(/Élément de travail introuvable/));
  });

  test("Should track the panel trigger source when invoked from the panel", async () => {
    const repo = createRepo("/repo", [{ name: "origin", fetchUrl: "https://dev.azure.com/myorg/myproject/_git/myrepo" }]);
    stubGit([repo]);

    await service.createBranchFromWorkItem("panel");

    assert.ok(telemetry.trackEvent.calledWith("devops.branch.created", sinon.match({ triggerSource: "panel" })));
  });
});
