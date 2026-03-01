import {
  AI_TEMPLATE_FILE_TYPES,
  AITemplateFile,
  InstalledTemplatesMap,
  RepositoryTemplatesMap,
} from "../../../../ai-template-files/models/aiTemplateFile";
import { TypeSection } from "../molecules/TypeSection";
import { FilterMode } from "../../types";

interface RepositorySectionProps {
  repository: RepositoryTemplatesMap;
  installedTemplates: InstalledTemplatesMap;
  onInstall: (template: AITemplateFile) => void;
  onUninstall: (template: AITemplateFile) => void;
  isTemplateInstalled: (template: AITemplateFile) => boolean;
  searchQuery: string;
  filterMode: FilterMode;
}

/**
 * RepositorySection Component
 * Legacy / backward-compatible repository section component.
 * Kept to support older code paths that still reference RepositorySection directly.
 */
export function RepositorySection({
  repository,
  installedTemplates,
  onInstall,
  onUninstall,
  isTemplateInstalled,
  searchQuery,
  filterMode,
}: RepositorySectionProps) {
  const isSearching = searchQuery.length > 0;

  // Apply search and filter to get filtered templates per type
  const getFilteredTemplates = (templates: AITemplateFile[]) => {
    let result = templates;
    if (isSearching) {
      result = result.filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (filterMode !== "all") {
      result = result.filter((t) => {
        const installed = isTemplateInstalled(t);
        return filterMode === "selected" ? installed : !installed;
      });
    }
    return result;
  };

  return (
    <div class="repository-section">
      <h3 class="repository-name">{repository.name}</h3>
      {AI_TEMPLATE_FILE_TYPES.map((type) => {
        const templates = getFilteredTemplates(repository.types[type]);
        // Skip section if no templates, except for skills which always shows
        if (templates.length === 0 && type !== "skills") return null;

        return (
          <TypeSection
            key={`${repository.name}::${type}`}
            type={type}
            templates={templates}
            sectionKey={`${repository.name}::${type}`}
            installedTemplates={installedTemplates}
            onInstall={onInstall}
            onUninstall={onUninstall}
            isTemplateInstalled={isTemplateInstalled}
            isSearching={isSearching}
            selectedFirst={false}
            showRepository={false}
          />
        );
      })}
    </div>
  );
}
