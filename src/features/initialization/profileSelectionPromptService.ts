import * as vscode from "vscode";
import { ProfileService } from "../profile-management/services/profileService";
import { Profile } from "../profile-management/models/profile";

/**
 * Service for prompting users to select a profile during workspace initialization
 */
export class ProfileSelectionPromptService {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * Prompt user to select a profile if any are available
   * @returns The selected profile name, or null if user chose to skip or no profiles exist
   */
  public async promptProfileSelection(): Promise<string | null> {
    const profiles = this.profileService.getProfiles();

    // No profiles saved - skip prompt
    if (profiles.length === 0) {
      return null;
    }

    // Build quick pick items
    const skipOption: vscode.QuickPickItem = {
      label: "⏭️ Skip - Install default templates",
      description: "Install all prompts and agents from Nexus Templates",
      alwaysShow: true,
    };

    const profileOptions: vscode.QuickPickItem[] = profiles.map((profile) => ({
      label: profile.name,
      description: `${profile.templates.length} template${profile.templates.length !== 1 ? "s" : ""}`,
      detail: this.getProfileDetail(profile),
    }));

    const allOptions = [skipOption, ...profileOptions];

    // Show quick pick
    const selected = await vscode.window.showQuickPick(allOptions, {
      placeHolder: "Select a profile to apply, or skip to install default templates",
      ignoreFocusOut: false,
      title: "Workspace Initialization - Profile Selection",
    });

    // User dismissed or selected skip option
    if (!selected || selected.label === skipOption.label) {
      return null;
    }

    // Return the selected profile name
    return selected.label;
  }

  /**
   * Get detail text for a profile showing template breakdown
   */
  private getProfileDetail(profile: Profile): string {
    const templatesByType = profile.templates.reduce(
      (acc, template) => {
        acc[template.type] = (acc[template.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const parts: string[] = [];
    if (templatesByType.agents) parts.push(`${templatesByType.agents} agent${templatesByType.agents !== 1 ? "s" : ""}`);
    if (templatesByType.prompts) parts.push(`${templatesByType.prompts} prompt${templatesByType.prompts !== 1 ? "s" : ""}`);
    if (templatesByType.chatmodes)
      parts.push(`${templatesByType.chatmodes} chatmode${templatesByType.chatmodes !== 1 ? "s" : ""}`);
    if (templatesByType.instructions)
      parts.push(`${templatesByType.instructions} instruction${templatesByType.instructions !== 1 ? "s" : ""}`);

    return parts.join(", ");
  }
}
