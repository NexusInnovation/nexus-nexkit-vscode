import { useMemo, useState } from "preact/hooks";
import { useDebounce } from "../../hooks/useDebounce";
import { SearchBar } from "../atoms/SearchBar";
import { RepositorySection } from "./RepositorySection";
import { useTemplateData } from "../../hooks/useTemplateData";
import { TemplateMetadataProvider } from "../../contexts/TemplateMetadataContext";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { FilterMenu } from "../atoms/FilterMenu";
import { useFilterMode } from "../../hooks/useFilterMode";

/**
 * TemplateSection Component
 * Main template management section with search and collapse all functionality
 */
export function TemplateSection() {
  const messenger = useVSCodeAPI();
  const { isReady, repositories, installedTemplates, installTemplate, uninstallTemplate, isTemplateInstalled } =
    useTemplateData();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [filterMode, setFilterMode] = useFilterMode();

  const installedTemplatesCount = useMemo(() => {
    return Object.values(installedTemplates).reduce((count, list) => count + list.length, 0);
  }, [installedTemplates]);

  const updateInstalledTemplates = () => {
    messenger.sendMessage({ command: "updateInstalledTemplates" });
  };

  return (
    <CollapsibleSection id="templates" title="Templates" defaultExpanded>
      <>
        {!isReady && <p class="loading">Loading templates...</p>}
        {isReady && (
          <div class="template-section">
            {installedTemplatesCount > 0 && (
              <div class="action-item">
                <button
                  class="action-button"
                  onClick={updateInstalledTemplates}
                  title="Update all installed templates to their latest versions from repositories."
                >
                  <span>Update Installed Templates ({installedTemplatesCount})</span>
                </button>
              </div>
            )}
            <div class="search-filter-row">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
              <FilterMenu filterMode={filterMode} onFilterChange={setFilterMode} />
            </div>
            <TemplateMetadataProvider>
              {repositories.map((repo) => (
                <RepositorySection
                  key={repo.name}
                  repository={repo}
                  installedTemplates={installedTemplates}
                  onInstall={installTemplate}
                  onUninstall={uninstallTemplate}
                  isTemplateInstalled={isTemplateInstalled}
                  searchQuery={debouncedSearchQuery}
                  filterMode={filterMode}
                />
              ))}
            </TemplateMetadataProvider>
          </div>
        )}
      </>
    </CollapsibleSection>
  );
}
