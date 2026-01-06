import { useState } from "preact/hooks";
import { useProfileData } from "../../hooks/useProfileData";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

/**
 * ProfileSection Component
 * Displays saved profiles and provides actions to save, apply, and delete them
 */
export function ProfileSection() {
  const { workspaceState } = useWorkspaceState();
  const { profiles, saveProfile, applyProfile, deleteProfile } = useProfileData();
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!workspaceState.hasWorkspace) return null;

  const toggleExpansion = () => {
    setIsExpanded(!isExpanded);
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div class="profile-section">
      <div class="section-header collapsible" onClick={toggleExpansion}>
        <h2>
          <span class={`chevron ${isExpanded ? "expanded" : ""}`}>›</span>
          Template Profiles
        </h2>
      </div>

      {isExpanded && (
        <div class="section-content">
          <div class="profile-actions">
            <button
              class="action-button profile-button"
              onClick={saveProfile}
              title="Save current installed templates as a profile"
            >
              <span class="codicon codicon-save"></span>
              <span>Save Current Profile</span>
            </button>
          </div>

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
                      {profile.templateCount} template{profile.templateCount !== 1 ? "s" : ""} • 
                      Updated: {formatDate(profile.updatedAt)}
                    </div>
                  </div>
                  <div class="profile-actions-row">
                    <button
                      class="profile-action-button apply-button"
                      onClick={applyProfile}
                      title={`Apply profile "${profile.name}"`}
                    >
                      <span class="codicon codicon-folder-opened"></span>
                      Apply
                    </button>
                  </div>
                </div>
              ))}
              <div class="profile-bulk-actions">
                <button
                  class="profile-action-button delete-button"
                  onClick={deleteProfile}
                  title="Delete one or more profiles"
                >
                  <span class="codicon codicon-trash"></span>
                  Delete Profiles
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
