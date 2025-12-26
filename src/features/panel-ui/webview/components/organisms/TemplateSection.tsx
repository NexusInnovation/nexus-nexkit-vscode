import { useState } from "preact/hooks";
import { useDebounce } from "../../hooks/useDebounce";
import { useExpansionState } from "../../hooks/useExpansionState";
import { SearchBar } from "../atoms/SearchBar";
import { RepositorySection } from "./RepositorySection";
import { useTemplateData } from "../../hooks/useTemplateData";
import { CollapseAllButton } from "../atoms/CollapseAllButton";

/**
 * TemplateSection Component
 * Main template management section with search and collapse all functionality
 */
export function TemplateSection() {
  const {
      repositories,
      installedTemplates,
      installTemplate,
      uninstallTemplate,
      isTemplateInstalled,
    } = useTemplateData();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const { isSectionExpanded, setSectionExpanded, collapseAll } = useExpansionState();

  const handleCollapseAll = () => {
    collapseAll();
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
        <CollapseAllButton onClick={handleCollapseAll} />
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
            onInstall={installTemplate}
            onUninstall={uninstallTemplate}
            isTemplateInstalled={isTemplateInstalled}
            searchQuery={debouncedSearchQuery}
          />
        ))}
      </div>
    </div>
  );
}
