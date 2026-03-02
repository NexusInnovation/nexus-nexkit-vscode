import { useState, useEffect, useRef } from "preact/hooks";
import { GroupMode } from "../../types";

interface GroupMenuProps {
  groupMode: GroupMode;
  selectedFirst: boolean;
  onGroupChange: (mode: GroupMode) => void;
  onSelectedFirstChange: (value: boolean) => void;
}

/**
 * GroupMenu Component
 * Dropdown menu for grouping templates by type, repository, or none
 */
export function GroupMenu({ groupMode, selectedFirst, onGroupChange, onSelectedFirstChange }: GroupMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleGroupSelect = (mode: GroupMode) => {
    onGroupChange(mode);
  };

  return (
    <div class="group-menu" ref={menuRef}>
      <button
        type="button"
        class="group-menu-btn"
        title="Group templates"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Group templates menu"
      >
        <i class="codicon codicon-list-tree"></i>
      </button>
      {isOpen && (
        <div class="group-dropdown" role="menu">
          <div class="dropdown-section-label">Group by</div>
          <label class="filter-option">
            <input
              type="radio"
              name="group-mode"
              value="type"
              checked={groupMode === "type"}
              onChange={() => handleGroupSelect("type")}
            />
            <span>Type</span>
          </label>
          <label class="filter-option">
            <input
              type="radio"
              name="group-mode"
              value="repository"
              checked={groupMode === "repository"}
              onChange={() => handleGroupSelect("repository")}
            />
            <span>Repository</span>
          </label>
          <label class="filter-option">
            <input
              type="radio"
              name="group-mode"
              value="none"
              checked={groupMode === "none"}
              onChange={() => handleGroupSelect("none")}
            />
            <span>None (flat list)</span>
          </label>
          <div class="dropdown-divider"></div>
          <label class="filter-option">
            <input type="checkbox" checked={selectedFirst} onChange={() => onSelectedFirstChange(!selectedFirst)} />
            <span>Selected first</span>
          </label>
        </div>
      )}
    </div>
  );
}
