import { useCallback, useMemo } from "preact/hooks";
import { useVSCodeAPI } from "./useVSCodeAPI";
import { useAppState } from "./useAppState";
import { AITemplateFile, InstalledTemplatesMap, OperationMode } from "../../../ai-template-files/models/aiTemplateFile";

/**
 * Hook to access template data and operations
 * Now reads from global state instead of managing its own state
 * @param mode Optional mode to filter repositories by (e.g., "Developers" or "APM")
 */
export function useTemplateData(mode?: OperationMode) {
  const messenger = useVSCodeAPI();
  const { templates } = useAppState();

  /**
   * Filter repositories by mode if provided
   * - APM mode: Only shows repositories that explicitly include "APM" in modes
   * - Developers mode: Shows repositories with "Developers" mode OR no modes specified
   * - No mode filter: Shows all repositories
   */
  const repositories = useMemo(() => {
    if (!mode) {
      return templates.repositories;
    }

    return templates.repositories.filter((repo) => {
      // If no modes specified on repository
      if (!repo.modes || repo.modes.length === 0) {
        // APM mode requires explicit opt-in - repos without modes are NOT shown in APM
        // Developers mode shows repos without modes (backward compatibility)
        return mode === "Developers";
      }
      return repo.modes.includes(mode);
    });
  }, [templates.repositories, mode]);

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
    repositories,
    installedTemplates: templates.installed,
    isReady: templates.isReady,
    installTemplate,
    uninstallTemplate,
    isTemplateInstalled,
  };
}
