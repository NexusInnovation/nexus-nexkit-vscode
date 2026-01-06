import { useCallback } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { useAppState } from "./useAppState";
import { Profile } from "../../../profile-management/models/profile";

/**
 * Hook to access profile data and operations
 * Now reads from global state instead of managing its own state
 */
export function useProfileData() {
  const messenger = useVSCodeAPI();
  const { profiles } = useAppState();

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
    profiles: profiles.list,
    isReady: profiles.isReady,
    applyProfile,
    deleteProfile,
  };
}
