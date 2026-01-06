import { useState, useEffect, useCallback } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";

/**
 * Profile data structure for display
 */
export interface ProfileData {
  name: string;
  templateCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Hook to manage profile data and operations
 */
export function useProfileData() {
  const messenger = useVSCodeAPI();
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
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
   * Trigger save profile command
   */
  const saveProfile = useCallback(() => {
    messenger.sendMessage({ command: "saveProfile" });
  }, [messenger]);

  /**
   * Trigger apply profile command
   */
  const applyProfile = useCallback(() => {
    messenger.sendMessage({ command: "applyProfile" });
  }, [messenger]);

  /**
   * Trigger delete profile command
   */
  const deleteProfile = useCallback(() => {
    messenger.sendMessage({ command: "deleteProfile" });
  }, [messenger]);

  return {
    profiles,
    isLoading,
    saveProfile,
    applyProfile,
    deleteProfile,
  };
}
