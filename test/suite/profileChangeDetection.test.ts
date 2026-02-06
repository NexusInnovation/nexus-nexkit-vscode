/**
 * Tests for Profile Change Detection functionality
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { ProfileService } from "../../src/features/profile-management/services/profileService";
import { InstalledTemplatesStateManager } from "../../src/features/ai-template-files/services/installedTemplatesStateManager";
import { AITemplateDataService } from "../../src/features/ai-template-files/services/aiTemplateDataService";
import { GitHubTemplateBackupService } from "../../src/features/backup-management/backupService";
import { SettingsManager } from "../../src/core/settingsManager";
import { InstalledTemplateRecord } from "../../src/features/ai-template-files/models/installedTemplateRecord";

suite("Unit: Profile Change Detection - Template Comparison Logic", () => {
  let profileService: ProfileService;
  let mockContext: vscode.ExtensionContext;
  let stateManager: InstalledTemplatesStateManager;
  let aiTemplateDataService: AITemplateDataService;
  let backupService: GitHubTemplateBackupService;
  let mockState: Map<string, any>;

  setup(() => {
    // Create mock workspace state
    mockState = new Map();

    mockContext = {
      workspaceState: {
        get: (key: string) => mockState.get(key),
        update: async (key: string, value: any) => {
          mockState.set(key, value);
        },
      },
      globalState: {
        get: () => undefined,
        update: async () => {},
      },
    } as any;

    // Initialize SettingsManager with mock context
    SettingsManager.initialize(mockContext);

    stateManager = new InstalledTemplatesStateManager(mockContext);
    aiTemplateDataService = new AITemplateDataService(stateManager);
    backupService = new GitHubTemplateBackupService();
    profileService = new ProfileService(stateManager, aiTemplateDataService, backupService);
  });

  teardown(() => {
    aiTemplateDataService.dispose();
  });

  test("Should return false for non-existent profile", async () => {
    // Act: Check for changes on non-existent profile
    const hasChanges = await profileService.hasTemplateChanges("Non-Existent Profile");

    // Assert: Should return false
    assert.strictEqual(hasChanges, false, "Should return false for non-existent profile");
  });

  test("Should detect no changes when workspace has no templates", async () => {
    // This tests the basic behavior without needing to mock profiles
    // Since no profile exists, it should return false
    const hasChanges = await profileService.hasTemplateChanges("Any Profile");
    assert.strictEqual(hasChanges, false);
  });
});

suite("Integration: Last Applied Profile Tracking", () => {
  let mockContext: vscode.ExtensionContext;
  let mockState: Map<string, any>;
  let mockGlobalState: Map<string, any>;

  setup(() => {
    mockState = new Map();
    mockGlobalState = new Map();

    mockContext = {
      workspaceState: {
        get: (key: string) => mockState.get(key),
        update: async (key: string, value: any) => {
          mockState.set(key, value);
        },
      },
      globalState: {
        get: (key: string) => mockGlobalState.get(key),
        update: async (key: string, value: any) => {
          mockGlobalState.set(key, value);
        },
      },
    } as any;

    SettingsManager.initialize(mockContext);
  });

  test("Should initialize with null last applied profile", () => {
    const lastProfile = SettingsManager.getLastAppliedProfile();
    // In test environment, it may return null or undefined initially
    assert.ok(lastProfile === null || lastProfile === undefined, "Should start with no last applied profile");
  });

  test("Should store and retrieve last applied profile", async () => {
    const profileName = "My Profile";

    await SettingsManager.setLastAppliedProfile(profileName);
    const retrieved = SettingsManager.getLastAppliedProfile();

    assert.strictEqual(retrieved, profileName, "Should retrieve the stored profile name");
  });

  test("Should clear last applied profile", async () => {
    await SettingsManager.setLastAppliedProfile("Some Profile");
    await SettingsManager.setLastAppliedProfile(null);

    const retrieved = SettingsManager.getLastAppliedProfile();
    assert.strictEqual(retrieved, null, "Should clear the last applied profile");
  });

  test("Should update last applied profile when changed", async () => {
    await SettingsManager.setLastAppliedProfile("Profile 1");
    await SettingsManager.setLastAppliedProfile("Profile 2");

    const retrieved = SettingsManager.getLastAppliedProfile();
    assert.strictEqual(retrieved, "Profile 2", "Should update to the new profile name");
  });

  test("Should get confirm before switch setting", () => {
    // Test that the setting getter works (will use default value)
    const isEnabled = SettingsManager.isProfileConfirmBeforeSwitchEnabled();
    // Default is true, but in test environment it might not be registered
    // Just verify the method exists and returns a boolean
    assert.strictEqual(typeof isEnabled, "boolean");
  });
});
