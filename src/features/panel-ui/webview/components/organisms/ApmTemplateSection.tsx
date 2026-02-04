import { useMemo, useState } from "preact/hooks";
import { useDebounce } from "../../hooks/useDebounce";
import { SearchBar } from "../atoms/SearchBar";
import { useTemplateData } from "../../hooks/useTemplateData";
import { TemplateMetadataProvider } from "../../contexts/TemplateMetadataContext";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { TemplateItem } from "../atoms/TemplateItem";
import { AITemplateFile } from "../../../../ai-template-files/models/aiTemplateFile";

/**
 * ApmTemplateSection Component
 * Template management section for APM mode
 * Shows only agents from APM repositories - no prompts, skills, or instructions
 */
export function ApmTemplateSection() {
  const { isReady, repositories, installTemplate, uninstallTemplate, isTemplateInstalled } = useTemplateData("APM");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Get all agents from APM repositories
  const agents = useMemo(() => {
    const allAgents: AITemplateFile[] = [];
    for (const repo of repositories) {
      allAgents.push(...repo.types.agents);
    }
    return allAgents;
  }, [repositories]);

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    if (!debouncedSearchQuery) {
      return agents;
    }
    const query = debouncedSearchQuery.toLowerCase();
    return agents.filter((agent) => agent.name.toLowerCase().includes(query));
  }, [agents, debouncedSearchQuery]);

  return (
    <CollapsibleSection id="apm-templates" title="Agent Templates" defaultExpanded>
      <>
        {!isReady && <p class="loading">Loading agent templates...</p>}
        {isReady && (
          <div class="template-section">
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search agents..." />
            <TemplateMetadataProvider>
              <div class="apm-agents-list">
                {filteredAgents.length === 0 && (
                  <p class="empty-message">
                    {debouncedSearchQuery ? "No agents match your search." : "No agent templates available."}
                  </p>
                )}
                {filteredAgents.map((agent) => (
                  <TemplateItem
                    key={`${agent.repository}::${agent.name}`}
                    template={agent}
                    isInstalled={isTemplateInstalled(agent)}
                    onInstall={() => installTemplate(agent)}
                    onUninstall={() => uninstallTemplate(agent)}
                  />
                ))}
              </div>
            </TemplateMetadataProvider>
          </div>
        )}
      </>
    </CollapsibleSection>
  );
}
