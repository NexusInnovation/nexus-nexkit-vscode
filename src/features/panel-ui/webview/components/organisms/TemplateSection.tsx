import { useState } from "preact/hooks";
import { useDebounce } from "../../hooks/useDebounce";
import { useExpansionState } from "../../hooks/useExpansionState";
import { useFilterState } from "../../hooks/useFilterState";
import { SearchBar } from "../atoms/SearchBar";
import { RepositorySection } from "./RepositorySection";
import { useTemplateData } from "../../hooks/useTemplateData";
import { CollapseAllButton } from "../atoms/CollapseAllButton";
import { FilterMenu } from "../atoms/FilterMenu";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";
import { TemplateMetadataProvider } from "../../contexts/TemplateMetadataContext";

/**
 * TemplateSection Component
 * Main template management section with search and collapse all functionality
 */
export function TemplateSection() {
  const { workspaceState } = useWorkspaceState();
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
  const { filterMode, setFilterMode } = useFilterState();

  const handleCollapseAll = () => {
    collapseAll();
    // Force a re-render by setting a dummy state
    // This is a workaround to trigger the collapse effect
    setSearchQuery((prev) => prev);
  };

  if (!workspaceState.hasWorkspace) return null;

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
        <div class="section-header-actions">
          <FilterMenu filterMode={filterMode} onFilterChange={setFilterMode} />
          <CollapseAllButton onClick={handleCollapseAll} />
        </div>
      </div>

      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      <div id="templateContainer">
        <TemplateMetadataProvider>
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
              filterMode={filterMode}
            />
          ))}
        </TemplateMetadataProvider>
      </div>
    </div>
  );
}
