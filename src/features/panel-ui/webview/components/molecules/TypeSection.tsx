import { useRef, useEffect } from "preact/hooks";
import { TemplateItem } from "../atoms/TemplateItem";
import { AITemplateFile, InstalledTemplatesMap } from "../../../../ai-template-files/models/aiTemplateFile";
import { FilterMode } from "../../types";

interface TypeSectionProps {
  type: string;
  templates: AITemplateFile[];
  repository: string;
  installedTemplates: InstalledTemplatesMap;
  isExpanded: boolean;
  onToggle: (expanded: boolean) => void;
  onInstall: (template: AITemplateFile) => void;
  onUninstall: (template: AITemplateFile) => void;
  isTemplateInstalled: (template: AITemplateFile) => boolean;
  searchQuery: string;
  filterMode: FilterMode;
}

const TYPE_DISPLAY_NAMES: Record<string, string> = {
  agents: "🤖 Agents",
  prompts: "🎯 Prompts",
  instructions: "📋 Instructions",
  chatmodes: "🤖 Chat Modes",
};

/**
 * TypeSection Component
 * Collapsible section for a specific template type (agents, prompts, etc.)
 */
export function TypeSection({
  type,
  templates,
  repository,
  installedTemplates,
  isExpanded,
  onToggle,
  onInstall,
  onUninstall,
  isTemplateInstalled,
  searchQuery,
  filterMode,
}: TypeSectionProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Filter templates based on search query
  const isSearching = searchQuery.length > 0;
  let filteredTemplates = isSearching
    ? templates.filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : templates;

  // Apply filter mode
  if (filterMode !== "all") {
    filteredTemplates = filteredTemplates.filter((t) => {
      const installed = isTemplateInstalled(t);
      return filterMode === "selected" ? installed : !installed;
    });
  }

  // Don't render if filtering results in no matches
  if (filteredTemplates.length === 0) {
    return null;
  }

  // Calculate counts
  const installedList = installedTemplates[type as keyof InstalledTemplatesMap] || [];
  const installedCount = templates.filter((t) => {
    const qualifiedName = `${t.repository}::${t.name}`;
    return installedList.includes(qualifiedName);
  }).length;
  const totalCount = templates.length;

  // Sync the expanded state with the details element
  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = isSearching ? true : isExpanded;
    }
  }, [isExpanded, isSearching]);

  const handleToggle = () => {
    if (!isSearching && detailsRef.current) {
      onToggle(detailsRef.current.open);
    }
  };

  const displayName = TYPE_DISPLAY_NAMES[type];
  const headerText = isSearching
    ? `${displayName} (${filteredTemplates.length} ${filteredTemplates.length === 1 ? "result" : "results"})`
    : `${displayName} (${installedCount}/${totalCount})`;

  return (
    <details
      ref={detailsRef}
      class="type-section"
      data-repository={repository}
      data-type={type}
      onToggle={handleToggle}
    >
      <summary class="type-header">{headerText}</summary>
      <div class="template-list">
        {filteredTemplates.map((template) => (
          <TemplateItem
            key={`${template.repository}::${template.type}::${template.name}`}
            template={template}
            isInstalled={isTemplateInstalled(template)}
            onInstall={onInstall}
            onUninstall={onUninstall}
          />
        ))}
      </div>
    </details>
  );
}
