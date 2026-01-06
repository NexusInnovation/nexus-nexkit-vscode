import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { Commands } from "../../shared/constants/commands";
import { registerCommand } from "../../shared/commands/commandRegistry";

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
            { modal: true },
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
    async () => {
      try {
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

        // Confirm application
        const confirm = await vscode.window.showWarningMessage(
          `Apply profile "${selected.profile.name}"?\n\nThis will replace all currently installed templates with ${selected.profile.templates.length} template${selected.profile.templates.length !== 1 ? "s" : ""} from this profile. A backup will be created first.`,
          { modal: true },
          "Apply",
          "Cancel"
        );

        if (confirm !== "Apply") {
          return;
        }

        // Apply the profile with progress
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Applying profile "${selected.profile.name}"...`,
            cancellable: false,
          },
          async () => {
            const result = await services.profileService.applyProfile(selected.profile.name);

            // Show result summary
            let message = `Profile "${selected.profile.name}" applied successfully!\n\n`;
            message += `✓ ${result.installed} template${result.installed !== 1 ? "s" : ""} installed\n`;

            if (result.skipped > 0) {
              message += `⚠ ${result.skipped} template${result.skipped !== 1 ? "s" : ""} skipped (not found in repositories):\n`;
              result.skippedTemplates.forEach((name) => {
                message += `  • ${name}\n`;
              });
            }

            if (result.backupPath) {
              message += `\nBackup created at: ${result.backupPath}`;
            }

            vscode.window.showInformationMessage(message);
          }
        );
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
    async () => {
      try {
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

        // Confirm deletion
        const profileNames = selected.map((item) => item.label).join(", ");
        const confirm = await vscode.window.showWarningMessage(
          `Delete ${selected.length} profile${selected.length !== 1 ? "s" : ""}?\n\n${profileNames}\n\nThis action cannot be undone.`,
          { modal: true },
          "Delete",
          "Cancel"
        );

        if (confirm !== "Delete") {
          return;
        }

        // Delete profiles
        const namesToDelete = selected.map((item) => item.label);
        const deletedCount = await services.profileService.deleteProfiles(namesToDelete);

        vscode.window.showInformationMessage(`${deletedCount} profile${deletedCount !== 1 ? "s" : ""} deleted successfully.`);
      } catch (error) {
        console.error("Failed to delete profiles:", error);
        vscode.window.showErrorMessage(`Failed to delete profiles: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    services.telemetry
  );
}
