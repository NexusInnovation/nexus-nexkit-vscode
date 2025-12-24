/**
 * RepositorySection Component
 * Displays a repository with its template types
 */

import { RepositoryTemplateData, InstalledTemplatesMap, TemplateFileData } from "../types";
import { TypeSection } from "./TypeSection";

interface RepositorySectionProps {
  repository: RepositoryTemplateData;
  installedTemplates: InstalledTemplatesMap;
  isSectionExpanded: (repository: string, type: string) => boolean;
  setSectionExpanded: (repository: string, type: string, expanded: boolean) => void;
  onInstall: (template: TemplateFileData) => void;
  onUninstall: (template: TemplateFileData) => void;
  isTemplateInstalled: (template: TemplateFileData) => boolean;
  searchQuery: string;
}

const TEMPLATE_TYPES: Array<keyof RepositoryTemplateData["types"]> = [
  "agents",
  "prompts",
  "instructions",
  "chatmodes",
];

export function RepositorySection({
  repository,
  installedTemplates,
  isSectionExpanded,
  setSectionExpanded,
  onInstall,
  onUninstall,
  isTemplateInstalled,
  searchQuery,
}: RepositorySectionProps) {
  return (
    <div class="repository-section">
      <h3 class="repository-name">{repository.name}</h3>
      {TEMPLATE_TYPES.map((type) => {
        const templates = repository.types[type];
        if (templates.length === 0) return null;

        return (
          <TypeSection
            key={`${repository.name}::${type}`}
            type={type}
            templates={templates}
            repository={repository.name}
            installedTemplates={installedTemplates}
            isExpanded={isSectionExpanded(repository.name, type)}
            onToggle={(expanded) => setSectionExpanded(repository.name, type, expanded)}
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
