import { useProfileData } from "../../hooks/useProfileData";
import { CollapsibleSection } from "../molecules/CollapsibleSection";

/**
 * ProfileSection Component
 * Displays saved profiles and provides actions to save, apply, and delete them
 */
export function ProfileSection() {
  const { profiles, applyProfile, deleteProfile } = useProfileData();

  return (
    <CollapsibleSection title="Profiles">
      {profiles.length === 0 ? (
        <p class="empty-message">
          No saved profiles yet. Save your current template configuration to quickly apply it to other workspaces.
        </p>
      ) : (
        <div class="profiles-list">
          {profiles.map((profile) => (
            <div key={profile.name} class="profile-item">
              <div class="profile-info">
                <div class="profile-name">{profile.name}</div>
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
                  Apply
                </button>
                <button
                  class="profile-action-button delete-button"
                  onClick={() => deleteProfile(profile)}
                  title={`Delete profile "${profile.name}"`}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
