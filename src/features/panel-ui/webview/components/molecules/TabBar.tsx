import { JSX } from "preact";

export interface TabDefinition {
  id: string;
  icon: string;
  label: string;
}

interface TabBarProps {
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  badges?: Record<string, boolean>;
}

/**
 * TabBar Component
 * Renders a horizontal icon tab bar for switching between panel sections.
 */
export function TabBar({ tabs, activeTab, onTabChange, badges }: TabBarProps): JSX.Element {
  return (
    <div class="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          class={`tab-button ${activeTab === tab.id ? "active" : ""}`}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-label={tab.label}
          title={tab.label}
          onClick={() => onTabChange(tab.id)}
        >
          <span class="tab-icon-wrapper">
            <i class={`codicon codicon-${tab.icon}`} />
            {badges?.[tab.id] && <span class="tab-badge" />}
          </span>
        </button>
      ))}
    </div>
  );
}
