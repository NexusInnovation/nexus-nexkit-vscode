import { useState } from "preact/hooks";
import { useDebounce } from "../../hooks/useDebounce";
import { useExpansionState } from "../../hooks/useExpansionState";
import { SearchBar } from "../atoms/SearchBar";
import { RepositorySection } from "./RepositorySection";
import { useTemplateData } from "../../hooks/useTemplateData";
import { TemplateMetadataProvider } from "../../contexts/TemplateMetadataContext";
import { CollapsibleSection } from "../molecules/CollapsibleSection";

/**
 * TemplateSection Component
 * Main template management section with search and collapse all functionality
 */
export function TemplateSection() {
  const { repositories, installedTemplates, installTemplate, uninstallTemplate, isTemplateInstalled } = useTemplateData();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const { isSectionExpanded, setSectionExpanded } = useExpansionState();

  return (
    <CollapsibleSection title="Templates" defaultExpanded>
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
            />
          ))}
        </TemplateMetadataProvider>
      </div>
    </CollapsibleSection>
  );
}
