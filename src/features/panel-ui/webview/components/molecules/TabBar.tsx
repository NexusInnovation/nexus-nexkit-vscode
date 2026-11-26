import { JSX } from "preact";
import { useState } from "preact/hooks";
import { moveTab, shiftTab } from "../../utils/tabOrder";

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
  /** Called with the new tab id order after a drag and drop (or Alt+Arrow) reordering */
  onReorder?: (order: string[]) => void;
}

/**
 * TabBar Component
 * Renders a horizontal icon tab bar for switching between panel sections.
 * Tabs can be reordered by drag and drop, or with Alt+Left / Alt+Right on a focused tab.
 */
export function TabBar({ tabs, activeTab, onTabChange, badges, onReorder }: TabBarProps): JSX.Element {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const ids = tabs.map((t) => t.id);

  const endDrag = (): void => {
    setDraggedId(null);
    setDropTargetId(null);
  };

  const handleDrop = (event: DragEvent, targetId: string): void => {
    event.preventDefault();
    if (draggedId && draggedId !== targetId) {
      onReorder?.(moveTab(ids, draggedId, targetId));
    }
    endDrag();
  };

  const handleKeyDown = (event: KeyboardEvent, tabId: string): void => {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return;
    }
    event.preventDefault();
    const next = shiftTab(ids, tabId, event.key === "ArrowLeft" ? -1 : 1);
    if (next !== ids) {
      onReorder?.(next);
      // Keep keyboard focus on the tab once it has moved
      requestAnimationFrame(() => document.getElementById(`tab-${tabId}`)?.focus());
    }
  };

  return (
    <div class="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          class={`tab-button ${activeTab === tab.id ? "active" : ""} ${draggedId === tab.id ? "dragging" : ""} ${
            dropTargetId === tab.id && draggedId !== tab.id ? "drop-target" : ""
          }`}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          aria-label={tab.label}
          title={`${tab.label} (drag to reorder)`}
          draggable={!!onReorder}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, tab.id)}
          onDragStart={(e) => {
            setDraggedId(tab.id);
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", tab.id);
            }
          }}
          onDragOver={(e) => {
            if (draggedId) {
              e.preventDefault();
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "move";
              }
              setDropTargetId(tab.id);
            }
          }}
          onDragLeave={() => setDropTargetId((current) => (current === tab.id ? null : current))}
          onDrop={(e) => handleDrop(e, tab.id)}
          onDragEnd={endDrag}
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
