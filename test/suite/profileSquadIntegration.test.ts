import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";
import {
  AITemplateFile,
  AITemplateFileType,
  RepositoryTemplatesMap,
} from "../../src/features/ai-template-files/models/aiTemplateFile";
import { InstalledTemplateRecord } from "../../src/features/ai-template-files/models/installedTemplateRecord";
import { AITemplateDataService } from "../../src/features/ai-template-files/services/aiTemplateDataService";
import { InstalledTemplatesStateManager } from "../../src/features/ai-template-files/services/installedTemplatesStateManager";
import { BatchInstallSummary } from "../../src/features/ai-template-files/services/templateFileOperations";
import { GitHubTemplateBackupService } from "../../src/features/backup-management/backupService";
import { Profile } from "../../src/features/profile-management/models/profile";
import { ProfileService } from "../../src/features/profile-management/services/profileService";
import {
  SquadMarketplaceKind,
  SquadPluginStatus,
  SquadProfileConfig,
  SquadUpstreamKind,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";
import { SquadProfileApplyOutcome, SquadProfileService } from "../../src/features/squad/services/squadProfileService";

interface StoredConfiguration {
  get<T>(key: string, defaultValue?: T): T;
  update<T>(key: string, value: T | undefined): Promise<void>;
}

interface ProfileServiceHarness {
  service: ProfileService;
  settings: Map<string, unknown>;
  workspaceState: Map<string, unknown>;
  stateManager: {
    syncWithFileSystem: sinon.SinonStub;
    getInstalledTemplates: sinon.SinonStub;
    clearState: sinon.SinonStub;
  };
  aiTemplateData: {
    getRepositoryTemplatesMap: sinon.SinonStub;
    installBatch: sinon.SinonStub;
  };
  backupService: {
    backupTemplates: sinon.SinonStub;
  };
  squadProfileService: {
    captureCurrentConfig: sinon.SinonStub;
    applyProfileConfig: sinon.SinonStub;
  };
  getProfilesChangedCount(): number;
}

const TEMPLATE_TYPES: AITemplateFileType[] = ["agents", "prompts", "skills", "instructions", "chatmodes", "hooks"];

const installedTemplate: InstalledTemplateRecord = {
  name: "squad.agent.md",
  type: "agents",
  repository: "nexus-ai-templates",
  repositoryUrl: "https://github.com/NexusInnovation/nexus-ai-templates",
  rawUrl: "https://raw.githubusercontent.com/NexusInnovation/nexus-ai-templates/main/agents/squad.agent.md",
  installedAt: 1,
};

const repositoryTemplate: AITemplateFile = {
  name: installedTemplate.name,
  type: installedTemplate.type,
  repository: installedTemplate.repository,
  repositoryUrl: installedTemplate.repositoryUrl,
  rawUrl: installedTemplate.rawUrl,
};

const squadConfig: SquadProfileConfig = {
  presetId: "team-alpha",
  upstreams: [{ id: "org", kind: SquadUpstreamKind.Git, reference: "NexusInnovation/squad-org", gitRef: "main" }],
  pluginMarketplaces: [
    {
      id: "core",
      source: "NexusInnovation/nexus-plugin-marketplace",
      kind: SquadMarketplaceKind.GitHub,
      enabled: true,
    },
  ],
  plugins: [
    {
      id: "nexus-plugin",
      enabled: true,
      status: SquadPluginStatus.Enabled,
      version: "1.2.3",
    },
  ],
  modelConfig: {
    defaultModel: "gpt-5.6-terra",
    overrides: [{ agentId: "link", model: "claude-opus-5.5" }],
  },
  ralph: { autoStartWatch: true, backlogPlatform: "github" },
};

suite("Integration: ProfileService with Squad profile configuration (SQD-050)", () => {
  let sandbox: sinon.SinonSandbox;
  let tempDir: string;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-profile-squad-"));
  });

  teardown(() => {
    sandbox.restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("Given installed templates and Squad state When saving a profile Then it persists the FR-065 Squad section", async () => {
    const harness = createHarness({ captureResult: squadOk(squadConfig) });

    const saved = await harness.service.saveProfile(" Team Alpha ");

    assert.strictEqual(saved, true);
    const profiles = getStoredProfiles(harness.settings);
    assert.strictEqual(profiles.length, 1);
    assert.strictEqual(profiles[0].name, "Team Alpha");
    assert.deepStrictEqual(profiles[0].templates, [installedTemplate]);
    assert.deepStrictEqual(profiles[0].squad, squadConfig);
    assert.ok(harness.stateManager.syncWithFileSystem.calledOnce);
    assert.ok(harness.squadProfileService.captureCurrentConfig.calledOnce);
    assert.strictEqual(harness.getProfilesChangedCount(), 1);
  });

  test("Given no Squad markers When saving a profile Then it preserves the existing template-only profile contract", async () => {
    const harness = createHarness({ captureResult: squadOk(undefined) });

    const saved = await harness.service.saveProfile("Template Only");

    assert.strictEqual(saved, true);
    const [profile] = getStoredProfiles(harness.settings);
    assert.ok(profile);
    assert.deepStrictEqual(profile.templates, [installedTemplate]);
    assert.ok(!Object.prototype.hasOwnProperty.call(profile, "squad"));
  });

  test("Given Squad capture fails When saving a profile Then no profile is saved and the error is actionable", async () => {
    const harness = createHarness({
      captureResult: squadErr({
        code: "parse-failed",
        message: ".squad/config.json is not valid JSON.",
        remediation: "Fix .squad/config.json, then save the profile again.",
      }),
    });

    await assert.rejects(
      () => harness.service.saveProfile("Broken Squad"),
      /Could not capture Squad configuration: \.squad\/config\.json is not valid JSON\. Fix \.squad\/config\.json, then save the profile again\./
    );

    assert.deepStrictEqual(getStoredProfiles(harness.settings), []);
    assert.strictEqual(harness.getProfilesChangedCount(), 0);
  });

  test("Given a saved Squad profile When applying it Then templates install and Squad config is applied before last-applied is updated", async () => {
    const profile = createProfile("Team Alpha", squadConfig);
    const squadOutcome: SquadProfileApplyOutcome = {
      applied: true,
      backupPath: path.join(tempDir, "backup"),
      writtenFiles: [
        ".squad/config.json",
        ".squad/upstream.json",
        ".squad/plugins/marketplaces.json",
        ".squad/model-config.json",
      ],
      pluginCount: 1,
    };
    const harness = createHarness({
      initialProfiles: [profile],
      applyResult: squadOk(squadOutcome),
    });

    const result = await harness.service.applyProfile("Team Alpha");

    assert.deepStrictEqual(result, {
      summary: installSummary(),
      backupPath: null,
      squad: squadOutcome,
    });
    assert.ok(harness.stateManager.clearState.calledOnce);
    assert.ok(harness.aiTemplateData.installBatch.calledOnceWithExactly([repositoryTemplate], { silent: true, overwrite: true }));
    assert.ok(harness.squadProfileService.applyProfileConfig.calledOnceWithExactly(squadConfig));
    assert.ok(harness.aiTemplateData.installBatch.calledBefore(harness.squadProfileService.applyProfileConfig));
    assert.strictEqual(SettingsManager.getLastAppliedProfile(), "Team Alpha");
    assert.strictEqual(harness.getProfilesChangedCount(), 1);
  });

  test("Given Squad apply fails When applying a profile Then last-applied is not updated and no success event is emitted", async () => {
    const harness = createHarness({
      initialProfiles: [createProfile("Team Alpha", squadConfig)],
      applyResult: squadErr({
        code: "file-write-failed",
        message: "Could not apply the Squad profile configuration to .squad/config.json.",
        remediation: "Check workspace file permissions, then apply the profile again.",
      }),
    });

    await assert.rejects(
      () => harness.service.applyProfile("Team Alpha"),
      /Could not apply Squad configuration: Could not apply the Squad profile configuration to \.squad\/config\.json\. Check workspace file permissions, then apply the profile again\./
    );

    assert.ok(harness.aiTemplateData.installBatch.calledOnce);
    assert.ok(harness.squadProfileService.applyProfileConfig.calledOnceWithExactly(squadConfig));
    assert.strictEqual(SettingsManager.getLastAppliedProfile(), null);
    assert.strictEqual(harness.getProfilesChangedCount(), 0);
  });

  test("Given saved profiles with Squad config When deleting one Then only the requested profile is removed", async () => {
    const keptProfile = createProfile("Keep", undefined);
    const deletedProfile = createProfile("Delete", squadConfig);
    const harness = createHarness({ initialProfiles: [keptProfile, deletedProfile] });

    const deletedCount = await harness.service.deleteProfiles(["Delete"]);

    assert.strictEqual(deletedCount, 1);
    assert.deepStrictEqual(getStoredProfiles(harness.settings), [keptProfile]);
    assert.ok(harness.squadProfileService.captureCurrentConfig.notCalled);
    assert.ok(harness.squadProfileService.applyProfileConfig.notCalled);
    assert.strictEqual(harness.getProfilesChangedCount(), 1);
  });

  function createHarness(options: {
    initialProfiles?: Profile[];
    captureResult?: ReturnType<typeof squadOk<SquadProfileConfig | undefined>> | ReturnType<typeof squadErr>;
    applyResult?: ReturnType<typeof squadOk<SquadProfileApplyOutcome>> | ReturnType<typeof squadErr>;
  }): ProfileServiceHarness {
    const settings = new Map<string, unknown>([["profiles", options.initialProfiles ?? []]]);
    const workspaceState = new Map<string, unknown>();
    installSettingsHarness(settings, workspaceState);
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: vscode.Uri.file(tempDir), name: "workspace", index: 0 }]);

    const stateManager = {
      syncWithFileSystem: sandbox.stub().resolves(),
      getInstalledTemplates: sandbox.stub().returns([installedTemplate]),
      clearState: sandbox.stub().resolves(),
    };
    const aiTemplateData = {
      getRepositoryTemplatesMap: sandbox.stub().returns([createRepositoryTemplatesMap(repositoryTemplate)]),
      installBatch: sandbox.stub().resolves(installSummary()),
    };
    const backupService = {
      backupTemplates: sandbox.stub().resolves(path.join(tempDir, "template-backup")),
    };
    const squadProfileService = {
      captureCurrentConfig: sandbox.stub().resolves(options.captureResult ?? squadOk(undefined)),
      applyProfileConfig: sandbox
        .stub()
        .resolves(options.applyResult ?? squadOk({ applied: false, backupPath: null, writtenFiles: [], pluginCount: 0 })),
    };

    const service = new ProfileService(
      stateManager as unknown as InstalledTemplatesStateManager,
      aiTemplateData as unknown as AITemplateDataService,
      backupService as unknown as GitHubTemplateBackupService,
      squadProfileService as unknown as SquadProfileService
    );
    let profilesChangedCount = 0;
    service.onProfilesChanged(() => {
      profilesChangedCount++;
    });

    return {
      service,
      settings,
      workspaceState,
      stateManager,
      aiTemplateData,
      backupService,
      squadProfileService,
      getProfilesChangedCount: () => profilesChangedCount,
    };
  }

  function installSettingsHarness(settings: Map<string, unknown>, workspaceState: Map<string, unknown>): void {
    const mockContext = {
      workspaceState: {
        get: <T>(key: string, defaultValue?: T) => (workspaceState.has(key) ? (workspaceState.get(key) as T) : defaultValue),
        update: async (key: string, value: unknown) => {
          workspaceState.set(key, value);
        },
      },
      globalState: {
        get: <T>(_key: string, defaultValue?: T) => defaultValue,
        update: async () => undefined,
      },
    };
    SettingsManager.initialize(mockContext as unknown as vscode.ExtensionContext);

    const config: StoredConfiguration = {
      get: <T>(key: string, defaultValue?: T) => (settings.has(key) ? (settings.get(key) as T) : (defaultValue as T)),
      update: async <T>(key: string, value: T | undefined) => {
        if (value === undefined) {
          settings.delete(key);
          return;
        }
        settings.set(key, value);
      },
    };

    sandbox.stub(vscode.workspace, "getConfiguration").callsFake((section?: string) => {
      if (section === "nexkit") {
        return config as unknown as vscode.WorkspaceConfiguration;
      }
      return {
        get: <T>(_key: string, defaultValue?: T) => defaultValue,
        update: async () => undefined,
      } as unknown as vscode.WorkspaceConfiguration;
    });
  }
});

function createProfile(name: string, config: SquadProfileConfig | undefined): Profile {
  return {
    name,
    templates: [installedTemplate],
    ...(config ? { squad: config } : {}),
    createdAt: 1,
    updatedAt: 1,
  };
}

function createRepositoryTemplatesMap(template: AITemplateFile): RepositoryTemplatesMap {
  const types = TEMPLATE_TYPES.reduce(
    (accumulator, type) => {
      accumulator[type] = [];
      return accumulator;
    },
    {} as Record<AITemplateFileType, AITemplateFile[]>
  );
  types[template.type].push(template);
  return {
    name: template.repository,
    types,
  };
}

function getStoredProfiles(settings: Map<string, unknown>): Profile[] {
  return settings.get("profiles") as Profile[];
}

function installSummary(): BatchInstallSummary {
  return {
    installed: 1,
    failed: 0,
    types: {
      agents: 1,
      prompts: 0,
      skills: 0,
      instructions: 0,
      chatmodes: 0,
      hooks: 0,
    },
  };
}
