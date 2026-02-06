import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { Commands } from "../../shared/constants/commands";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Profile } from "./models/profile";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Register command to save current templates as a profile
 */
export function registerSaveProfileCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.SAVE_PROFILE,
    async () => {
      try {
        // Prompt for profile name
        const profileName = await vscode.window.showInputBox({
          prompt: "Enter a name for this profile",
          placeHolder: "e.g., Python Project, Full Stack, Data Science",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Profile name cannot be empty";
            }
            if (value.trim().length > 50) {
              return "Profile name is too long (max 50 characters)";
            }
            return undefined;
          },
        });

        if (!profileName) {
          // User cancelled
          return;
        }

        const trimmedName = profileName.trim();

        // Check if profile already exists
        if (services.profileService.profileExists(trimmedName)) {
          const overwrite = await vscode.window.showWarningMessage(
            `Profile "${trimmedName}" already exists. Do you want to overwrite it?`,
            "Overwrite",
            "Cancel"
          );

          if (overwrite !== "Overwrite") {
            return;
          }
        }

        // Save the profile
        await services.profileService.saveProfile(trimmedName, false);

        const profile = services.profileService.getProfile(trimmedName);
        const templateCount = profile?.templates.length || 0;

        vscode.window.showInformationMessage(
          `Profile "${trimmedName}" saved successfully with ${templateCount} template${templateCount !== 1 ? "s" : ""}.`
        );
      } catch (error) {
        console.error("Failed to save profile:", error);
        vscode.window.showErrorMessage(`Failed to save profile: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    services.telemetry
  );
}

/**
 * Register command to apply a saved profile
 */
export function registerApplyProfileCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.APPLY_PROFILE,
    async (profile: Profile | undefined) => {
      try {
        let profileToApply: Profile;

        if (profile) {
          profileToApply = profile;
        } else {
          const profiles = services.profileService.getProfiles();

          if (profiles.length === 0) {
            vscode.window.showInformationMessage("No profiles saved yet. Save your first profile to get started!");
            return;
          }

          // Create QuickPick items
          const items = profiles.map((profile) => ({
            label: profile.name,
            description: `${profile.templates.length} template${profile.templates.length !== 1 ? "s" : ""}`,
            detail: `Last updated: ${new Date(profile.updatedAt).toLocaleString()}`,
            profile,
          }));

          // Show profile picker
          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: "Select a profile to apply",
            matchOnDescription: true,
            matchOnDetail: true,
          });

          if (!selected) {
            // User cancelled
            return;
          }

          profileToApply = selected.profile;
        }

        // Check if we should prompt to save current templates before switching
        if (SettingsManager.isProfileConfirmBeforeSwitchEnabled()) {
          const hasChanges = await services.profileService.hasTemplateChanges(profileToApply.name);

          if (hasChanges) {
            const lastProfile = SettingsManager.getLastAppliedProfile();

            if (lastProfile && services.profileService.profileExists(lastProfile)) {
              // User has a previously applied profile - offer to update it or save as new
              const choice = await vscode.window.showWarningMessage(
                `You have unsaved changes. What would you like to do?`,
                { modal: true },
                `Update "${lastProfile}"`,
                "Save as New",
                "Switch Without Saving"
              );

              if (!choice) {
                // User cancelled
                return;
              }

              if (choice === `Update "${lastProfile}"`) {
                // Update the existing profile
                await services.profileService.saveProfile(lastProfile, false);
                vscode.window.showInformationMessage(`Profile "${lastProfile}" updated successfully.`);
              } else if (choice === "Save as New") {
                // Prompt for new profile name
                const newProfileName = await vscode.window.showInputBox({
                  prompt: "Enter a name for this profile",
                  placeHolder: "e.g., Python Project, Full Stack, Data Science",
                  validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                      return "Profile name cannot be empty";
                    }
                    if (value.trim().length > 50) {
                      return "Profile name is too long (max 50 characters)";
                    }
                    if (services.profileService.profileExists(value.trim())) {
                      return "A profile with this name already exists";
                    }
                    return undefined;
                  },
                });

                if (!newProfileName) {
                  // User cancelled
                  return;
                }

                await services.profileService.saveProfile(newProfileName.trim(), false);
                vscode.window.showInformationMessage(`Profile "${newProfileName.trim()}" saved successfully.`);
              }
              // "Switch Without Saving" - continue to apply profile
            } else {
              // No last profile - offer only save as new or switch without saving
              const choice = await vscode.window.showInformationMessage(
                `Save current templates before switching to "${profileToApply.name}"?`,
                "Save as New",
                "Switch Without Saving"
              );

              if (!choice) {
                // User cancelled
                return;
              }

              if (choice === "Save as New") {
                // Prompt for new profile name
                const newProfileName = await vscode.window.showInputBox({
                  prompt: "Enter a name for this profile",
                  placeHolder: "e.g., Python Project, Full Stack, Data Science",
                  validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                      return "Profile name cannot be empty";
                    }
                    if (value.trim().length > 50) {
                      return "Profile name is too long (max 50 characters)";
                    }
                    if (services.profileService.profileExists(value.trim())) {
                      return "A profile with this name already exists";
                    }
                    return undefined;
                  },
                });

                if (!newProfileName) {
                  // User cancelled
                  return;
                }

                await services.profileService.saveProfile(newProfileName.trim(), false);
                vscode.window.showInformationMessage(`Profile "${newProfileName.trim()}" saved successfully.`);
              }
              // "Switch Without Saving" - continue to apply profile
            }
          }
          // If no changes detected, silently continue to apply profile
        }

        const result = await services.profileService.applyProfile(profileToApply.name);

        // Show result summary
        let message = `Profile "${profileToApply.name}" applied successfully!`;
        message += ` ✓ ${result.summary.installed} template${result.summary.installed !== 1 ? "s" : ""} installed.`;

        if (result.summary.failed > 0) {
          message += ` ⚠ ${result.summary.failed} template${result.summary.failed !== 1 ? "s" : ""} skipped (not found in repositories or couldn't install them).`;
        }

        if (result.backupPath) {
          message += ` Backup created at: ${result.backupPath}`;
        }

        vscode.window.showInformationMessage(message);
      } catch (error) {
        console.error("Failed to apply profile:", error);
        vscode.window.showErrorMessage(`Failed to apply profile: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    services.telemetry
  );
}

/**
 * Register command to delete profiles
 */
export function registerDeleteProfileCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.DELETE_PROFILE,
    async (...profiles: Profile[]) => {
      try {
        let profileNamesToDelete: string[];

        if (profiles && profiles.length > 0) {
          profileNamesToDelete = profiles.map((p) => p.name);
        } else {
          const profiles = services.profileService.getProfiles();

          if (profiles.length === 0) {
            vscode.window.showInformationMessage("No profiles to delete.");
            return;
          }

          // Create QuickPick items
          const items = profiles.map((profile) => ({
            label: profile.name,
            description: `${profile.templates.length} template${profile.templates.length !== 1 ? "s" : ""}`,
            detail: `Created: ${new Date(profile.createdAt).toLocaleString()}`,
            picked: false,
          }));

          // Show multi-select picker
          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: "Select profile(s) to delete",
            canPickMany: true,
            matchOnDescription: true,
            matchOnDetail: true,
          });

          if (!selected || selected.length === 0) {
            // User cancelled or selected nothing
            return;
          }

          profileNamesToDelete = selected.map((item) => item.label);
        }

        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(
          `You're about to delete the following profile${profileNamesToDelete.length !== 1 ? "s" : ""}: ${profileNamesToDelete.map((p) => `"${p}"`).join(", ")}. This action cannot be undone.`,
          "Delete",
          "Cancel"
        );

        if (confirm !== "Delete") {
          return;
        }

        // Delete profiles
        const deletedCount = await services.profileService.deleteProfiles(profileNamesToDelete);

        vscode.window.showInformationMessage(`${deletedCount} profile${deletedCount !== 1 ? "s" : ""} deleted successfully.`);
      } catch (error) {
        console.error("Failed to delete profiles:", error);
        vscode.window.showErrorMessage(`Failed to delete profiles: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    services.telemetry
  );
}
