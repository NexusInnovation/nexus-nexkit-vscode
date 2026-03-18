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
}

/**
 * TabBar Component
 * Renders a horizontal icon tab bar for switching between panel sections.
 */
export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps): JSX.Element {
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
          <i class={`codicon codicon-${tab.icon}`} />
        </button>
      ))}
    </div>
  );
}
