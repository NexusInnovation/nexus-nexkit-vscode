import { useCallback } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { useAppState } from "./useAppState";
import { AITemplateFile, InstalledTemplatesMap } from "../../../ai-template-files/models/aiTemplateFile";

/**
 * Hook to access template data and operations
 * Now reads from global state instead of managing its own state
 */
export function useTemplateData() {
  const messenger = useVSCodeAPI();
  const { templates } = useAppState();

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
      const installedList = templates.installed[template.type as keyof InstalledTemplatesMap] || [];
      const qualifiedName = `${template.repository}::${template.name}`;
      return installedList.includes(qualifiedName);
    },
    [templates.installed]
  );

  return {
    repositories: templates.repositories,
    installedTemplates: templates.installed,
    isReady: templates.isReady,
    installTemplate,
    uninstallTemplate,
    isTemplateInstalled,
  };
}
