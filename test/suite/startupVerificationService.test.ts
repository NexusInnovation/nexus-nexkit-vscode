import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { StartupVerificationService } from "../../src/features/initialization/startupVerificationService";
import { GitIgnoreConfigDeployer } from "../../src/features/initialization/gitIgnoreConfigDeployer";
import { RecommendedSettingsConfigDeployer } from "../../src/features/initialization/recommendedSettingsConfigDeployer";
import { NexkitFileMigrationService } from "../../src/features/initialization/nexkitFileMigrationService";
import { HooksConfigDeployer } from "../../src/features/initialization/hooksConfigDeployer";
import { GitHubAuthPromptService } from "../../src/features/initialization/githubAuthPromptService";

suite("Unit: StartupVerificationService", () => {
  let service: StartupVerificationService;
  let workspaceDir: string;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-startup-workspace-test-"));

    const gitIgnoreDeployer = new GitIgnoreConfigDeployer();
    const settingsDeployer = new RecommendedSettingsConfigDeployer();
    const hooksConfigDeployer = new HooksConfigDeployer();
    const migrationService = new NexkitFileMigrationService();
    const authPromptService = new GitHubAuthPromptService();

    service = new StartupVerificationService(
      gitIgnoreDeployer,
      settingsDeployer,
      hooksConfigDeployer,
      migrationService,
      authPromptService
    );
  });

  teardown(() => {
    sandbox.restore();
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  test("Should instantiate StartupVerificationService", () => {
    assert.ok(service);
  });

  test("verifyOnStartup should skip if no workspace folder", async () => {
    sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);
    await service.verifyOnStartup();
  });

  test("verifyWorkspaceConfiguration should run without throwing", async () => {
    await service.verifyWorkspaceConfiguration(workspaceDir);
  });
});
