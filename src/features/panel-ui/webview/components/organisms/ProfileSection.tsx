import { useProfileData } from "../../hooks/useProfileData";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { ProfileInfoTooltip } from "../atoms/ProfileInfoTooltip";

/**
 * ProfileSection Component
 * Displays saved profiles and provides actions to save, apply, and delete them
 */
export function ProfileSection() {
  const { isReady, profiles, applyProfile, deleteProfile } = useProfileData();

  return (
    <CollapsibleSection id="profiles" title="Profiles">
      <>
        {!isReady && <p>Loading profiles...</p>}
        {isReady && profiles.length === 0 && (
          <p class="empty-message">
            No saved profiles yet. Save your current template configuration to quickly apply it to other workspaces.
          </p>
        )}
        {isReady && profiles.length > 0 && (
          <div class="profiles-list">
            {profiles.map((profile) => (
              <div key={profile.name} class="profile-item">
                <div class="profile-info">
                  <div class="profile-name">
                    {profile.name}
                    <ProfileInfoTooltip profile={profile} />
                  </div>
                  <div class="profile-details">
                    {profile.templates.length} template{profile.templates.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div class="profile-actions-row">
                  <button
                    class="profile-action-button apply-button"
                    onClick={() => applyProfile(profile)}
                    title={`Apply profile "${profile.name}"`}
                  >
                    <i class="codicon codicon-rocket"></i>
                  </button>
                  <button
                    class="profile-action-button delete-button"
                    onClick={() => deleteProfile(profile)}
                    title={`Delete profile "${profile.name}"`}
                  >
                    <i class="codicon codicon-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    </CollapsibleSection>
  );
}
