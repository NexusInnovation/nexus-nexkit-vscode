import {
  AI_TEMPLATE_FILE_TYPES,
  AITemplateFile,
  InstalledTemplatesMap,
  RepositoryTemplatesMap,
} from "../../../../ai-template-files/models/aiTemplateFile";
import { TypeSection } from "../molecules/TypeSection";

interface RepositorySectionProps {
  repository: RepositoryTemplatesMap;
  installedTemplates: InstalledTemplatesMap;
  onInstall: (template: AITemplateFile) => void;
  onUninstall: (template: AITemplateFile) => void;
  isTemplateInstalled: (template: AITemplateFile) => boolean;
  searchQuery: string;
}

/**
 * RepositorySection Component
 * Displays a repository with its template types
 */
export function RepositorySection({
  repository,
  installedTemplates,
  onInstall,
  onUninstall,
  isTemplateInstalled,
  searchQuery,
}: RepositorySectionProps) {
  return (
    <div class="repository-section">
      <h3 class="repository-name">{repository.name}</h3>
      {AI_TEMPLATE_FILE_TYPES.map((type) => {
        const templates = repository.types[type];
        if (templates.length === 0) return null;

        return (
          <TypeSection
            key={`${repository.name}::${type}`}
            type={type}
            templates={templates}
            repository={repository.name}
            installedTemplates={installedTemplates}
            onInstall={onInstall}
            onUninstall={onUninstall}
            isTemplateInstalled={isTemplateInstalled}
            searchQuery={searchQuery}
          />
        );
      })}
    </div>
  );
}
