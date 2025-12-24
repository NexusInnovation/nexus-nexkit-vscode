/**
 * TemplateSection Component
 * Main template management section with search and collapse all functionality
 */

import { useState } from "preact/hooks";
import { RepositoryTemplateData, InstalledTemplatesMap, TemplateFileData } from "../types";
import { useDebounce } from "../hooks/useDebounce";
import { useExpansionState } from "../hooks/useExpansionState";
import { SearchBar } from "./SearchBar";
import { RepositorySection } from "./RepositorySection";

interface TemplateSectionProps {
  repositories: RepositoryTemplateData[];
  installedTemplates: InstalledTemplatesMap;
  onInstall: (template: TemplateFileData) => void;
  onUninstall: (template: TemplateFileData) => void;
  isTemplateInstalled: (template: TemplateFileData) => boolean;
}

export function TemplateSection({
  repositories,
  installedTemplates,
  onInstall,
  onUninstall,
  isTemplateInstalled,
}: TemplateSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const { isSectionExpanded, setSectionExpanded } = useExpansionState();

  const handleCollapseAll = () => {
    // Collapse all sections by setting their state to false
    repositories.forEach((repo) => {
      ["agents", "prompts", "instructions", "chatmodes"].forEach((type) => {
        const templates = repo.types[type as keyof typeof repo.types];
        if (templates.length > 0) {
          setSectionExpanded(repo.name, type, false);
        }
      });
    });
    // Force a re-render by setting a dummy state
    // This is a workaround to trigger the collapse effect
    setSearchQuery((prev) => prev);
  };

  if (repositories.length === 0) {
    return (
      <div class="template-section">
        <div class="section-header">
          <h2>AI Template Files</h2>
        </div>
        <p class="empty-message">No template repositories loaded</p>
      </div>
    );
  }

  return (
    <div class="template-section">
      <div class="section-header">
        <h2>AI Template Files</h2>
        <button
          class="collapse-all-btn"
          title="Collapse All"
          onClick={handleCollapseAll}
        >
          <svg
            width="32px"
            height="32px"
            viewBox="0 0 76 76"
            xmlns="http://www.w3.org/2000/svg"
            version="1.1"
          >
            <style>
              {`.icon-path { fill: var(--vscode-icon-foreground); }`}
            </style>
            <path
              class="icon-path"
              fill-opacity="1"
              stroke-linejoin="round"
              d="M 19,29L 47,29L 47,57L 19,57L 19,29 Z M 43,33L 23,33.0001L 23,53L 43,53L 43,33 Z M 39,41L 39,45L 27,45L 27,41L 39,41 Z M 24,24L 51.9999,24.0001L 51.9999,52L 48.9999,52.0001L 48.9999,27.0001L 24,27.0001L 24,24 Z M 54,47L 53.9999,22.0001L 29,22L 29,19L 57,19L 57,47L 54,47 Z "
            />
          </svg>
        </button>
      </div>

      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      <div id="templateContainer">
        {repositories.map((repo) => (
          <RepositorySection
            key={repo.name}
            repository={repo}
            installedTemplates={installedTemplates}
            isSectionExpanded={isSectionExpanded}
            setSectionExpanded={setSectionExpanded}
            onInstall={onInstall}
            onUninstall={onUninstall}
            isTemplateInstalled={isTemplateInstalled}
            searchQuery={debouncedSearchQuery}
          />
        ))}
      </div>
    </div>
  );
}
