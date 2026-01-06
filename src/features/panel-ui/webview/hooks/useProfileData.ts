import { useState, useEffect, useCallback } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { Profile } from "../../../profile-management/models/profile";

/**
 * Hook to manage profile data and operations
 */
export function useProfileData() {
  const messenger = useVSCodeAPI();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for profile updates from extension
    const unsubscribe = messenger.onMessage("profilesUpdate", (message) => {
      if (message.command !== "profilesUpdate") return;
      setProfiles(message.profiles);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [messenger]);

  /**
   * Trigger apply profile command
   */
  const applyProfile = useCallback(
    (profile: Profile) => {
      messenger.sendMessage({ command: "applyProfile", profile });
    },
    [messenger]
  );

  /**
   * Trigger delete profile command
   */
  const deleteProfile = useCallback(
    (profile: Profile) => {
      messenger.sendMessage({ command: "deleteProfile", profile });
    },
    [messenger]
  );

  return {
    profiles,
    isLoading,
    applyProfile,
    deleteProfile,
  };
}
