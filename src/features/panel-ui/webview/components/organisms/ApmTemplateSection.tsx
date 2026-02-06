import { useMemo, useState } from "preact/hooks";
import { useDebounce } from "../../hooks/useDebounce";
import { SearchBar } from "../atoms/SearchBar";
import { useTemplateData } from "../../hooks/useTemplateData";
import { TemplateMetadataProvider } from "../../contexts/TemplateMetadataContext";
import { CollapsibleSection } from "../molecules/CollapsibleSection";
import { TemplateItem } from "../atoms/TemplateItem";
import { AITemplateFile, OperationMode } from "../../../../ai-template-files/models/aiTemplateFile";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";

/**
 * ApmTemplateSection Component
 * Template management section for APM mode
 * Shows only agents from APM repositories - no prompts, skills, or instructions
 */
export function ApmTemplateSection() {
  const messenger = useVSCodeAPI();
  const { isReady, repositories, installedTemplates, installTemplate, uninstallTemplate, isTemplateInstalled } = useTemplateData(
    OperationMode.APM
  );
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

  // Get APM repository names for filtering installed count
  const apmRepoNames = useMemo(() => new Set(repositories.map((r) => r.name)), [repositories]);

  // Count installed agents from APM repositories only
  const installedAgentsCount = useMemo(() => {
    const installedAgents = installedTemplates.agents || [];
    return installedAgents.filter((entry) => {
      const [repoName] = entry.split("::");
      return apmRepoNames.has(repoName);
    }).length;
  }, [installedTemplates, apmRepoNames]);

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    if (!debouncedSearchQuery) {
      return agents;
    }
    const query = debouncedSearchQuery.toLowerCase();
    return agents.filter((agent) => agent.name.toLowerCase().includes(query));
  }, [agents, debouncedSearchQuery]);

  const updateInstalledTemplates = () => {
    messenger.sendMessage({ command: "updateInstalledTemplates", mode: OperationMode.APM });
  };

  return (
    <CollapsibleSection id="apm-templates" title="Agent Templates" defaultExpanded>
      <>
        {!isReady && <p class="loading">Loading agent templates...</p>}
        {isReady && (
          <div class="template-section">
            {installedAgentsCount > 0 && (
              <div class="action-item">
                <button
                  class="action-button"
                  onClick={updateInstalledTemplates}
                  title="Update all installed agents to their latest versions from repositories."
                >
                  <span>Update Installed Templates ({installedAgentsCount})</span>
                </button>
              </div>
            )}
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
