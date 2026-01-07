import * as vscode from "vscode";
import { Profile, ApplyProfileResult } from "../models/profile";
import { InstalledTemplatesStateManager } from "../../ai-template-files/services/installedTemplatesStateManager";
import { AITemplateDataService } from "../../ai-template-files/services/aiTemplateDataService";
import { GitHubTemplateBackupService } from "../../backup-management/backupService";
import { SettingsManager } from "../../../core/settingsManager";
import { AITemplateFile } from "../../ai-template-files/models/aiTemplateFile";

/**
 * Service for managing template profiles
 */
export class ProfileService {
  private readonly _onProfilesChangedEmitter = new vscode.EventEmitter<void>();
  public readonly onProfilesChanged: vscode.Event<void> = this._onProfilesChangedEmitter.event;

  constructor(
    private readonly installedTemplatesStateManager: InstalledTemplatesStateManager,
    private readonly aiTemplateDataService: AITemplateDataService,
    private readonly backupService: GitHubTemplateBackupService
  ) {}

  /**
   * Save current installed templates as a new profile
   * @param name Profile name
   * @param confirmOverwrite If true and profile exists, will return false without overwriting
   * @returns True if saved successfully, false if profile exists and confirmOverwrite is false
   */
  public async saveProfile(name: string, confirmOverwrite: boolean = true): Promise<boolean> {
    // Validate profile name
    if (!name || name.trim().length === 0) {
      throw new Error("Profile name cannot be empty");
    }

    const trimmedName = name.trim();
    const profiles = SettingsManager.getProfiles();

    // Check if profile already exists
    const existingProfileIndex = profiles.findIndex((p) => p.name === trimmedName);
    if (existingProfileIndex >= 0 && confirmOverwrite) {
      return false; // Caller should prompt for confirmation
    }

    // Get current installed templates
    const installedTemplates = this.installedTemplatesStateManager.getInstalledTemplates();

    if (installedTemplates.length === 0) {
      throw new Error("No templates are currently installed. Cannot save an empty profile.");
    }

    const now = Date.now();
    const profile: Profile = {
      name: trimmedName,
      templates: installedTemplates,
      createdAt: existingProfileIndex >= 0 ? profiles[existingProfileIndex].createdAt : now,
      updatedAt: now,
    };

    // Save or update profile
    if (existingProfileIndex >= 0) {
      profiles[existingProfileIndex] = profile;
    } else {
      profiles.push(profile);
    }

    await SettingsManager.setProfiles(profiles);
    this._onProfilesChangedEmitter.fire();
    return true;
  }

  /**
   * Apply a saved profile to the current workspace
   * This will:
   * 1. Create a backup of the current .github folder
   * 2. Remove all currently installed templates
   * 3. Install all templates from the profile
   * @param profileName Name of the profile to apply
   * @returns Result summary with install counts and backup path
   */
  public async applyProfile(profileName: string): Promise<ApplyProfileResult> {
    const profiles = SettingsManager.getProfiles();
    const profile = profiles.find((p) => p.name === profileName);

    if (!profile) {
      throw new Error(`Profile "${profileName}" not found`);
    }

    if (profile.templates.length === 0) {
      throw new Error(`Profile "${profileName}" contains no templates`);
    }

    // Backup and delete existing template folders before applying profile
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error("No workspace folder found");
    }
    const backupPath = await this.backupService.backupTemplates(workspaceRoot);

    // Clear all currently installed templates from state
    await this.installedTemplatesStateManager.clearState();

    // Install templates from profile
    let installed = 0;
    let skipped = 0;
    const skippedTemplates: string[] = [];

    for (const templateRecord of profile.templates) {
      try {
        // Find the template in the data service
        const template = this.findTemplateInRepository(templateRecord);

        if (!template) {
          // Template not found in repositories - skip silently
          skipped++;
          skippedTemplates.push(`${templateRecord.name} (${templateRecord.repository})`);
          continue;
        }

        // Install the template
        const success = await this.aiTemplateDataService.installTemplate(template, { silent: true });

        if (success) installed++;
        else skipped++;
      } catch (error) {
        // Installation failed - skip silently
        console.error(`Failed to install template ${templateRecord.name}:`, error);
        skipped++;
        skippedTemplates.push(`${templateRecord.name} (${templateRecord.repository})`);
      }
    }

    this._onProfilesChangedEmitter.fire();
    return {
      installed,
      skipped,
      skippedTemplates,
      backupPath,
    };
  }

  /**
   * Delete one or more profiles
   * @param profileNames Names of profiles to delete
   * @returns Number of profiles deleted
   */
  public async deleteProfiles(profileNames: string[]): Promise<number> {
    if (profileNames.length === 0) {
      return 0;
    }

    const profiles = SettingsManager.getProfiles();
    const namesToDelete = new Set(profileNames);

    // Filter out profiles to delete
    const remainingProfiles = profiles.filter((p) => !namesToDelete.has(p.name));
    const deletedCount = profiles.length - remainingProfiles.length;

    await SettingsManager.setProfiles(remainingProfiles);
    if (deletedCount > 0) {
      this._onProfilesChangedEmitter.fire();
    }
    return deletedCount;
  }

  /**
   * Get all saved profiles
   */
  public getProfiles(): Profile[] {
    return SettingsManager.getProfiles();
  }

  /**
   * Check if a profile with the given name exists
   */
  public profileExists(name: string): boolean {
    const profiles = SettingsManager.getProfiles();
    return profiles.some((p) => p.name === name);
  }

  /**
   * Get a specific profile by name
   */
  public getProfile(name: string): Profile | undefined {
    const profiles = SettingsManager.getProfiles();
    return profiles.find((p) => p.name === name);
  }

  /**
   * Find a template in the loaded repositories
   */
  private findTemplateInRepository(record: { name: string; type: string; repository: string }): AITemplateFile | undefined {
    const repositories = this.aiTemplateDataService.getRepositoryTemplatesMap();

    for (const repo of repositories) {
      if (repo.name !== record.repository) {
        continue;
      }

      const templates = repo.types[record.type as keyof typeof repo.types];
      if (!templates) {
        continue;
      }

      const template = templates.find((t: AITemplateFile) => t.name === record.name);
      if (template) {
        return template;
      }
    }

    return undefined;
  }
}
