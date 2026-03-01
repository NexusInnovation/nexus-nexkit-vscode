import { useRef, useEffect } from "preact/hooks";
import { TemplateItem } from "../atoms/TemplateItem";
import { AITemplateFile, InstalledTemplatesMap } from "../../../../ai-template-files/models/aiTemplateFile";
import { useExpansionState } from "../../hooks/useExpansionState";

interface TypeSectionProps {
  type: string;
  templates: AITemplateFile[];
  sectionKey: string;
  installedTemplates: InstalledTemplatesMap;
  onInstall: (template: AITemplateFile) => void;
  onUninstall: (template: AITemplateFile) => void;
  isTemplateInstalled: (template: AITemplateFile) => boolean;
  isSearching: boolean;
  selectedFirst: boolean;
  showRepository?: boolean;
}

const TYPE_DISPLAY_NAMES: Record<string, string> = {
  agents: "Custom Agents",
  prompts: "Prompt Templates",
  skills: "Skills",
  instructions: "Coding Instructions",
  chatmodes: "Chat Modes",
  hooks: "Hooks",
};

const TYPE_ICONS: Record<string, string> = {
  agents: "codicon-hubot",
  prompts: "codicon-comment-discussion",
  skills: "codicon-package",
  instructions: "codicon-book",
  chatmodes: "codicon-chat-sparkle",
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  agents: "Specialized GitHub Copilot agents that extend functionality with custom behaviors and capabilities for specific tasks",
  prompts: "Reusable prompt templates for common coding tasks, refactoring patterns, and AI-assisted development workflows",
  skills: "Pre-built folder structures with code, configurations, and utilities that can be installed directly into your project",
  instructions:
    "Language-specific and project-wide coding guidelines that inform GitHub Copilot about your preferred code style and conventions",
  chatmodes: "Specialized conversation modes that configure GitHub Copilot Chat for different development contexts and workflows",
  hooks: "Event-driven scripts from public or private repositories that extend GitHub Copilot behavior at specific lifecycle points",
};

/**
 * TypeSection Component
 * Collapsible section for a specific template type (agents, prompts, etc.)
 * Supports templates from multiple repositories in a unified list
 */
export function TypeSection({
  type,
  templates,
  sectionKey,
  installedTemplates,
  onInstall,
  onUninstall,
  isTemplateInstalled,
  isSearching,
  selectedFirst,
  showRepository = true,
}: TypeSectionProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [isExpanded, setIsExpanded] = useExpansionState(sectionKey);

  // Don't render if no templates and not skills
  if (templates.length === 0 && type !== "skills") {
    return null;
  }

  // Sort: selected first if enabled
  const sortedTemplates = selectedFirst
    ? [...templates].sort((a, b) => {
        const aInstalled = isTemplateInstalled(a) ? 0 : 1;
        const bInstalled = isTemplateInstalled(b) ? 0 : 1;
        return aInstalled - bInstalled;
      })
    : templates;

  // Find the boundary between selected and unselected for the separator
  let separatorIndex = -1;
  if (selectedFirst) {
    const firstUnselectedIdx = sortedTemplates.findIndex((t) => !isTemplateInstalled(t));
    const hasSelected = sortedTemplates.some((t) => isTemplateInstalled(t));
    if (hasSelected && firstUnselectedIdx > 0) {
      separatorIndex = firstUnselectedIdx;
    }
  }

  // Calculate counts
  const installedCount = templates.filter((t) => isTemplateInstalled(t)).length;
  const totalCount = templates.length;

  // Sync the expanded state with the details element
  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = isSearching ? true : isExpanded;
    }
  }, [isExpanded, isSearching]);

  const handleToggle = () => {
    if (!isSearching && detailsRef.current) {
      setIsExpanded(detailsRef.current.open);
    }
  };

  const displayName = TYPE_DISPLAY_NAMES[type] || type;
  const description = TYPE_DESCRIPTIONS[type];
  const iconClass = TYPE_ICONS[type];
  const headerText = isSearching
    ? `${displayName} (${templates.length} ${templates.length === 1 ? "result" : "results"})`
    : `${displayName} (${installedCount}/${totalCount})`;

  return (
    <details ref={detailsRef} class="type-section" data-type={type} onToggle={handleToggle}>
      <summary class="type-header" title={description}>
        {iconClass && <i class={`codicon ${iconClass} type-icon`} />}
        {headerText}
      </summary>
      <div class="template-list">
        {sortedTemplates.map((template, index) => (
          <div key={`${template.repository}::${template.type}::${template.name}`}>
            {index === separatorIndex && <div class="selected-separator" />}
            <TemplateItem
              template={template}
              isInstalled={isTemplateInstalled(template)}
              onInstall={onInstall}
              onUninstall={onUninstall}
              showRepository={showRepository}
            />
          </div>
        ))}
      </div>
    </details>
  );
}
