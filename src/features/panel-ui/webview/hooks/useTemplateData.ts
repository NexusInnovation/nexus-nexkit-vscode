/**
 * Custom hook for template data management
 * Manages template repositories, installed templates, and operations
 */

import { useState, useEffect, useCallback } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { RepositoryTemplateData, TemplateFileData, InstalledTemplatesMap } from "../types";

/**
 * Hook to manage template data and operations
 */
export function useTemplateData() {
  const messenger = useVSCodeAPI();
  const [repositories, setRepositories] = useState<RepositoryTemplateData[]>([]);
  const [installedTemplates, setInstalledTemplates] = useState<InstalledTemplatesMap>({
    agents: [],
    prompts: [],
    instructions: [],
    chatmodes: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for template data updates
    const unsubscribeTemplateData = messenger.onMessage("templateDataUpdate", (message) => {
      if (message.command === "templateDataUpdate") {
        setRepositories(message.repositories);
        setIsLoading(false);
      }
    });

    // Listen for installed templates updates
    const unsubscribeInstalledTemplates = messenger.onMessage("installedTemplatesUpdate", (message) => {
      if (message.command === "installedTemplatesUpdate") {
        setInstalledTemplates(message.installed);
      }
    });

    // Request initial data
    messenger.sendMessage({ command: "getTemplateData" });
    messenger.sendMessage({ command: "getInstalledTemplates" });

    return () => {
      unsubscribeTemplateData();
      unsubscribeInstalledTemplates();
    };
  }, [messenger]);

  /**
   * Install a template
   */
  const installTemplate = useCallback(
    (template: TemplateFileData) => {
      messenger.sendMessage({
        command: "installTemplate",
        template,
      });
    },
    [messenger]
  );

  /**
   * Uninstall a template
   */
  const uninstallTemplate = useCallback(
    (template: TemplateFileData) => {
      messenger.sendMessage({
        command: "uninstallTemplate",
        template,
      });
    },
    [messenger]
  );

  /**
   * Check if a template is installed
   */
  const isTemplateInstalled = useCallback(
    (template: TemplateFileData): boolean => {
      const installedList = installedTemplates[template.type as keyof InstalledTemplatesMap] || [];
      return installedList.includes(template.name);
    },
    [installedTemplates]
  );

  return {
    repositories,
    installedTemplates,
    isLoading,
    installTemplate,
    uninstallTemplate,
    isTemplateInstalled,
  };
}
