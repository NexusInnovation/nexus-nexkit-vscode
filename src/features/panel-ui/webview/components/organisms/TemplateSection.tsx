import { useMemo, useState } from "preact/hooks";
import { useDebounce } from "../../hooks/useDebounce";
import { SearchBar } from "../atoms/SearchBar";
import { useTemplateData } from "../../hooks/useTemplateData";
import { TemplateMetadataProvider } from "../../contexts/TemplateMetadataContext";
import { TypeSection } from "../molecules/TypeSection";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { FilterMenu } from "../atoms/FilterMenu";
import { GroupMenu } from "../atoms/GroupMenu";
import { useFilterMode, useGroupMode, useSelectedFirst, useTypeFilters, useRepositoryFilters } from "../../hooks/useFilterMode";
import { TemplateItem } from "../atoms/TemplateItem";
import { useAppState } from "../../hooks/useAppState";
import { fuzzySearch } from "../../utils/fuzzySearch";
import {
  AI_TEMPLATE_FILE_TYPES,
  AITemplateFile,
  InstalledTemplatesMap,
  OperationMode,
} from "../../../../ai-template-files/models/aiTemplateFile";

/**
 * TemplateSection Component
 * Main template management section with unified list, search, filtering, and grouping.
 * All repositories are merged into a single list with configurable grouping.
 */
export function TemplateSection() {
  const messenger = useVSCodeAPI();
  const { isReady, repositories, installedTemplates, installTemplate, uninstallTemplate, isTemplateInstalled } = useTemplateData(
    OperationMode.Developers
  );
  const { metadataScan, templates } = useAppState();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [filterMode, setFilterMode] = useFilterMode();
  const [groupMode, setGroupMode] = useGroupMode();
  const [selectedFirst, setSelectedFirst] = useSelectedFirst();
  const [typeFilters, setTypeFilters] = useTypeFilters();
  const [repositoryFilters, setRepositoryFilters] = useRepositoryFilters();

  // Get Developers mode repository names for filtering installed count
  const developersRepoNames = useMemo(() => new Set(repositories.map((r) => r.name)), [repositories]);

  // Count installed templates from Developers mode repositories only
  const installedTemplatesCount = useMemo(() => {
    let count = 0;
    for (const [type, entries] of Object.entries(installedTemplates)) {
      count += entries.filter((entry) => {
        const [repoName] = entry.split("::");
        return developersRepoNames.has(repoName);
      }).length;
    }
    return count;
  }, [installedTemplates, developersRepoNames]);

  // Flatten all templates from all repositories into a single list
  const allTemplates = useMemo(() => {
    const templates: AITemplateFile[] = [];
    for (const repo of repositories) {
      for (const type of AI_TEMPLATE_FILE_TYPES) {
        templates.push(...repo.types[type]);
      }
    }
    return templates;
  }, [repositories]);

  // Available types and repositories for filter menu
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const t of allTemplates) {
      types.add(t.type);
    }
    return AI_TEMPLATE_FILE_TYPES.filter((type) => types.has(type));
  }, [allTemplates]);

  const availableRepositories = useMemo(() => {
    return repositories.map((r) => r.name);
  }, [repositories]);

  // Build a lookup map from metadata index for O(1) access during fuzzy search
  const metadataLookup = useMemo(() => {
    const map = new Map<string, { name: string; description: string }>();
    for (const entry of metadataScan.index) {
      map.set(entry.key, { name: entry.name, description: entry.description });
    }
    return map;
  }, [metadataScan.index]);

  // Apply all filters: search (fuzzy when available), status, type, repository
  const filteredTemplates = useMemo(() => {
    let result = allTemplates;

    // Search filter — use fuzzy search when metadata scan is complete
    if (debouncedSearchQuery.length > 0) {
      if (metadataScan.isComplete && metadataLookup.size > 0) {
        // Enhanced fuzzy search using name + description from metadata
        const fuzzyResults = fuzzySearch(debouncedSearchQuery, result, (t) => {
          const key = `${t.repository}::${t.type}::${t.name}`;
          const meta = metadataLookup.get(key);
          if (meta) {
            return [meta.name, meta.description, t.name];
          }
          return [t.name];
        });
        result = fuzzyResults.map((r) => r.item);
      } else {
        // Fallback: simple filename search
        const query = debouncedSearchQuery.toLowerCase();
        result = result.filter((t) => t.name.toLowerCase().includes(query));
      }
    }

    // Status filter
    if (filterMode !== "all") {
      result = result.filter((t) => {
        const installed = isTemplateInstalled(t);
        return filterMode === "selected" ? installed : !installed;
      });
    }

    // Type filter (empty = show all)
    if (typeFilters.length > 0) {
      result = result.filter((t) => typeFilters.includes(t.type));
    }

    // Repository filter (empty = show all)
    if (repositoryFilters.length > 0) {
      result = result.filter((t) => repositoryFilters.includes(t.repository));
    }

    return result;
  }, [
    allTemplates,
    debouncedSearchQuery,
    filterMode,
    typeFilters,
    repositoryFilters,
    isTemplateInstalled,
    metadataScan.isComplete,
    metadataLookup,
  ]);

  const isSearching = debouncedSearchQuery.length > 0;

  const updateInstalledTemplates = () => {
    messenger.sendMessage({ command: "updateInstalledTemplates", mode: OperationMode.Developers });
  };

  /**
   * Render templates grouped by type
   */
  const renderGroupedByType = () => {
    return AI_TEMPLATE_FILE_TYPES.map((type) => {
      const templates = filteredTemplates.filter((t) => t.type === type);
      if (templates.length === 0 && type !== "skills") return null;

      return (
        <TypeSection
          key={`type::${type}`}
          type={type}
          templates={templates}
          sectionKey={`unified::${type}`}
          installedTemplates={installedTemplates}
          onInstall={installTemplate}
          onUninstall={uninstallTemplate}
          isTemplateInstalled={isTemplateInstalled}
          isSearching={isSearching}
          selectedFirst={selectedFirst}
          showRepository={availableRepositories.length > 1}
        />
      );
    });
  };

  /**
   * Render templates grouped by repository
   */
  const renderGroupedByRepository = () => {
    return repositories
      .filter((repo) => repositoryFilters.length === 0 || repositoryFilters.includes(repo.name))
      .map((repo) => {
        const repoTemplates = filteredTemplates.filter((t) => t.repository === repo.name);
        if (repoTemplates.length === 0) return null;

        return (
          <div key={`repo::${repo.name}`} class="repository-group">
            <div class="repository-group-header">{repo.name}</div>
            {AI_TEMPLATE_FILE_TYPES.map((type) => {
              const templates = repoTemplates.filter((t) => t.type === type);
              if (templates.length === 0 && type !== "skills") return null;

              return (
                <TypeSection
                  key={`repo::${repo.name}::${type}`}
                  type={type}
                  templates={templates}
                  sectionKey={`repo::${repo.name}::${type}`}
                  installedTemplates={installedTemplates}
                  onInstall={installTemplate}
                  onUninstall={uninstallTemplate}
                  isTemplateInstalled={isTemplateInstalled}
                  isSearching={isSearching}
                  selectedFirst={selectedFirst}
                  showRepository={false}
                />
              );
            })}
          </div>
        );
      });
  };

  /**
   * Render templates as a flat list (no grouping)
   */
  const renderFlatList = () => {
    // Sort: alphabetically by name, selected first if enabled
    const sortedTemplates = [...filteredTemplates].sort((a, b) => {
      if (selectedFirst) {
        const aInstalled = isTemplateInstalled(a) ? 0 : 1;
        const bInstalled = isTemplateInstalled(b) ? 0 : 1;
        if (aInstalled !== bInstalled) return aInstalled - bInstalled;
      }
      return a.name.localeCompare(b.name);
    });

    // Find separator boundary
    let separatorIndex = -1;
    if (selectedFirst) {
      const firstUnselectedIdx = sortedTemplates.findIndex((t) => !isTemplateInstalled(t));
      const hasSelected = sortedTemplates.some((t) => isTemplateInstalled(t));
      if (hasSelected && firstUnselectedIdx > 0) {
        separatorIndex = firstUnselectedIdx;
      }
    }

    if (sortedTemplates.length === 0) {
      return <p class="empty-message">No templates match your filters.</p>;
    }

    return (
      <div class="flat-template-list">
        {sortedTemplates.map((template, index) => (
          <div key={`${template.repository}::${template.type}::${template.name}`}>
            {index === separatorIndex && <div class="selected-separator" />}
            <TemplateItem
              template={template}
              isInstalled={isTemplateInstalled(template)}
              onInstall={installTemplate}
              onUninstall={uninstallTemplate}
              showRepository={availableRepositories.length > 1}
              showTypeIcon
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {!isReady && <p class="loading">Loading templates...</p>}
      {isReady && (
        <div class="template-section">
          {installedTemplatesCount > 0 && (
            <div class="action-item">
              {templates.updatesAvailable ? (
                <button
                  class="action-button"
                  onClick={updateInstalledTemplates}
                  title="Update all installed templates to their latest versions from repositories."
                >
                  <span>Update Installed Templates ({installedTemplatesCount})</span>
                </button>
              ) : (
                <span
                  class="action-indicator"
                  title="All installed templates are up to date; there are no updates available."
                >
                  Installed templates are up to date ({installedTemplatesCount})
                </span>
              )}
            </div>
          )}
          <div class="search-filter-row">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              isScanning={metadataScan.isScanning}
              isScanComplete={metadataScan.isComplete}
            />
            <FilterMenu
              filterMode={filterMode}
              onFilterChange={setFilterMode}
              typeFilters={typeFilters}
              onTypeFiltersChange={setTypeFilters}
              repositoryFilters={repositoryFilters}
              onRepositoryFiltersChange={setRepositoryFilters}
              availableTypes={availableTypes}
              availableRepositories={availableRepositories}
            />
            <GroupMenu
              groupMode={groupMode}
              selectedFirst={selectedFirst}
              onGroupChange={setGroupMode}
              onSelectedFirstChange={setSelectedFirst}
            />
          </div>
          <TemplateMetadataProvider>
            {groupMode === "type" && renderGroupedByType()}
            {groupMode === "repository" && renderGroupedByRepository()}
            {groupMode === "none" && renderFlatList()}
          </TemplateMetadataProvider>
        </div>
      )}
    </>
  );
}
