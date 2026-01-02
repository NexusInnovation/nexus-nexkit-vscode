import { useState, useEffect, useCallback } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { AITemplateFile, InstalledTemplatesMap, RepositoryTemplatesMap } from "../../../ai-template-files/models/aiTemplateFile";

/**
 * Hook to manage template data and operations
 */
export function useTemplateData() {
  const messenger = useVSCodeAPI();
  const [repositories, setRepositories] = useState<RepositoryTemplatesMap[]>([]);
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
      if (message.command !== "templateDataUpdate") return;
      setRepositories(message.repositories);
      setIsLoading(false);
    });

    // Listen for installed templates updates
    const unsubscribeInstalledTemplates = messenger.onMessage("installedTemplatesUpdate", (message) => {
      if (message.command !== "installedTemplatesUpdate") return;
      setInstalledTemplates(message.installed);
    });

    return () => {
      unsubscribeTemplateData();
      unsubscribeInstalledTemplates();
    };
  }, [messenger]);

  /**
   * Install a template
   */
  const installTemplate = useCallback(
    (template: AITemplateFile) => {
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
    (template: AITemplateFile) => {
      messenger.sendMessage({
        command: "uninstallTemplate",
        template,
      });
    },
    [messenger]
  );

  /**
   * Check if a template is installed
   * Checks using repository-qualified identifier: "repository::templateName"
   */
  const isTemplateInstalled = useCallback(
    (template: AITemplateFile): boolean => {
      const installedList = installedTemplates[template.type as keyof InstalledTemplatesMap] || [];
      const qualifiedName = `${template.repository}::${template.name}`;
      return installedList.includes(qualifiedName);
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
