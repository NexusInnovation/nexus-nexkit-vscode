import { useMemo, useState } from "preact/hooks";
import { useDebounce } from "../../hooks/useDebounce";
import { SearchBar } from "../atoms/SearchBar";
import { useTemplateData } from "../../hooks/useTemplateData";
import { TemplateMetadataProvider } from "../../contexts/TemplateMetadataContext";
import { TemplateItem } from "../atoms/TemplateItem";
import { AITemplateFile, OperationMode } from "../../../../ai-template-files/models/aiTemplateFile";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { useAppState } from "../../hooks/useAppState";
import { fuzzySearch } from "../../utils/fuzzySearch";

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
  const { metadataScan } = useAppState();
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

  // Build a lookup map from metadata index for O(1) access during fuzzy search
  const metadataLookup = useMemo(() => {
    const map = new Map<string, { name: string; description: string }>();
    for (const entry of metadataScan.index) {
      map.set(entry.key, { name: entry.name, description: entry.description });
    }
    return map;
  }, [metadataScan.index]);

  // Filter agents by search query — use fuzzy search when metadata is available
  const filteredAgents = useMemo(() => {
    if (!debouncedSearchQuery) {
      return agents;
    }
    if (metadataScan.isComplete && metadataLookup.size > 0) {
      const fuzzyResults = fuzzySearch(debouncedSearchQuery, agents, (agent) => {
        const key = `${agent.repository}::${agent.type}::${agent.name}`;
        const meta = metadataLookup.get(key);
        if (meta) {
          return [meta.name, meta.description, agent.name];
        }
        return [agent.name];
      });
      return fuzzyResults.map((r) => r.item);
    }
    const query = debouncedSearchQuery.toLowerCase();
    return agents.filter((agent) => agent.name.toLowerCase().includes(query));
  }, [agents, debouncedSearchQuery, metadataScan.isComplete, metadataLookup]);

  const updateInstalledTemplates = () => {
    messenger.sendMessage({ command: "updateInstalledTemplates", mode: OperationMode.APM });
  };

  return (
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
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search agents..."
            isScanning={metadataScan.isScanning}
            isScanComplete={metadataScan.isComplete}
          />
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
  );
}
