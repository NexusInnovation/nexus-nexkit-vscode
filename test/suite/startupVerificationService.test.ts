/**
 * Tests for StartupVerificationService
 * Verifies that essential Nexkit checks run at every VS Code startup:
 * - project .gitignore is not modified
 * - VS Code chat file settings are applied at global scope
 * - legacy nexkit files are migrated to user .nexkit
 * - GitHub authentication is verified
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { StartupVerificationService } from "../../src/features/initialization/startupVerificationService";
import { GitIgnoreConfigDeployer } from "../../src/features/initialization/gitIgnoreConfigDeployer";
import { RecommendedSettingsConfigDeployer } from "../../src/features/initialization/recommendedSettingsConfigDeployer";
import { NexkitFileMigrationService } from "../../src/features/initialization/nexkitFileMigrationService";
import { HooksConfigDeployer } from "../../src/features/initialization/hooksConfigDeployer";
import { GitHubAuthPromptService } from "../../src/features/initialization/githubAuthPromptService";
import { getNexkitUserDirectory } from "../../src/shared/utils/fileHelper";

suite("Unit: StartupVerificationService", () => {
  let service: StartupVerificationService;
  let workspaceDir: string;
  let homeDir: string;
  let sandbox: sinon.SinonSandbox;

  let gitIgnoreDeployer: GitIgnoreConfigDeployer;
  let settingsDeployer: RecommendedSettingsConfigDeployer;
  let migrationService: NexkitFileMigrationService;
  let hooksConfigDeployer: HooksConfigDeployer;
  let authPromptService: GitHubAuthPromptService;
  let originalHomeEnv: string | undefined;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
  let configStore: Record<string, any>;
  let updateTargets: vscode.ConfigurationTarget[];

  setup(() => {
    sandbox = sinon.createSandbox();
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-startup-workspace-test-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-startup-home-test-"));

    gitIgnoreDeployer = new GitIgnoreConfigDeployer();
    settingsDeployer = new RecommendedSettingsConfigDeployer();
    hooksConfigDeployer = new HooksConfigDeployer();
    migrationService = new NexkitFileMigrationService();
    authPromptService = new GitHubAuthPromptService();
    originalHomeEnv = process.env.HOME;
    process.env.HOME = homeDir;
    configStore = {};
    updateTargets = [];
    originalGetConfiguration = vscode.workspace.getConfiguration;
    (vscode.workspace as any).getConfiguration = () =>
      ({
        get: (key: string, defaultValue?: any) => (key in configStore ? configStore[key] : defaultValue),
        inspect: (key: string) => ({ globalValue: configStore[key] }),
        update: async (key: string, value: any, target: vscode.ConfigurationTarget) => {
          configStore[key] = value;
          updateTargets.push(target);
        },
      }) as any;

    service = new StartupVerificationService(
      gitIgnoreDeployer,
      settingsDeployer,
      hooksConfigDeployer,
      migrationService,
      authPromptService
    );
  });

  teardown(() => {
    (vscode.workspace as any).getConfiguration = originalGetConfiguration;
    process.env.HOME = originalHomeEnv;
    sandbox.restore();
    try {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should instantiate StartupVerificationService", () => {
    assert.ok(service);
  });

  test("verifyWorkspaceConfiguration should not create or modify .gitignore", async () => {
    await service.verifyWorkspaceConfiguration(workspaceDir);

    const gitignorePath = path.join(workspaceDir, ".gitignore");
    assert.ok(!fs.existsSync(gitignorePath));
  });

  test("verifyWorkspaceConfiguration should deploy global settings", async () => {
    await service.verifyWorkspaceConfiguration(workspaceDir);
    const userNexkitDir = getNexkitUserDirectory(vscode.env.appName);
    assert.deepStrictEqual(configStore["chat.agentFilesLocations"], { [path.join(userNexkitDir, "agents")]: true });
    assert.deepStrictEqual(configStore["chat.hookFilesLocations"], { [path.join(userNexkitDir, "hooks")]: true });
    assert.deepStrictEqual(configStore["chat.promptFilesLocations"], { [path.join(userNexkitDir, "prompts")]: true });
    assert.strictEqual(configStore["chat.useHooks"], true);
    assert.ok(updateTargets.every((target) => target === vscode.ConfigurationTarget.Global));
  });

  test("verifyWorkspaceConfiguration should migrate nexkit files", async () => {
    // Create a nexkit.* file in .github/agents
    const agentsDir = path.join(workspaceDir, ".github", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "nexkit.test-agent.md"), "agent content");

    await service.verifyWorkspaceConfiguration(workspaceDir);

    const userNexkitDir = getNexkitUserDirectory(vscode.env.appName);
    // File should be migrated to user .nexkit/agents
    assert.ok(fs.existsSync(path.join(userNexkitDir, "agents", "nexkit.test-agent.md")));
    assert.ok(!fs.existsSync(path.join(agentsDir, "nexkit.test-agent.md")));
  });

  test("verifyWorkspaceConfiguration should be idempotent", async () => {
    // Run twice — second run should not break anything
    await service.verifyWorkspaceConfiguration(workspaceDir);
    await service.verifyWorkspaceConfiguration(workspaceDir);

    assert.strictEqual(configStore["chat.useHooks"], true);
  });

  test("verifyOnStartup should skip if no workspace folder", async () => {
    sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);

    // Should not throw
    await service.verifyOnStartup();
  });
});
