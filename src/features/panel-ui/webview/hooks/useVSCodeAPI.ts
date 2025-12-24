/**
 * Custom hook for VS Code API integration
 * Provides access to the messenger singleton
 */

import { useEffect, useRef } from "preact/hooks";
import { VSCodeMessenger } from "../services/vscodeMessenger";

// Singleton messenger instance
let messengerInstance: VSCodeMessenger | null = null;

/**
 * Get or create the VSCode messenger singleton
 */
export function getMessenger(): VSCodeMessenger {
  if (!messengerInstance) {
    messengerInstance = new VSCodeMessenger();
  }
  return messengerInstance;
}

/**
 * Hook to access the VS Code messenger
 * Provides a stable reference to the messenger instance
 */
export function useVSCodeAPI() {
  const messengerRef = useRef<VSCodeMessenger>(getMessenger());
  return messengerRef.current;
}
