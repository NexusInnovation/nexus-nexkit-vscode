import { useState, useEffect, useRef } from "preact/hooks";
import { FilterMode } from "../../types";

interface FilterMenuProps {
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
}

/**
 * FilterMenu Component
 * Dropdown menu for filtering templates by installation status
 */
export function FilterMenu({ filterMode, onFilterChange }: FilterMenuProps) {
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

  const handleFilterSelect = (mode: FilterMode) => {
    onFilterChange(mode);
    setIsOpen(false);
  };

  return (
    <div class="filter-menu" ref={menuRef}>
      <button
        type="button"
        class="filter-menu-btn"
        title="Filter templates"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Filter templates menu"
      >
        <i class="codicon codicon-filter"></i>
      </button>
      {isOpen && (
        <div class="filter-dropdown" role="menu">
          <label class="filter-option">
            <input
              type="radio"
              name="filter-mode"
              value="all"
              checked={filterMode === "all"}
              onChange={() => handleFilterSelect("all")}
            />
            <span>View all</span>
          </label>
          <label class="filter-option">
            <input
              type="radio"
              name="filter-mode"
              value="selected"
              checked={filterMode === "selected"}
              onChange={() => handleFilterSelect("selected")}
            />
            <span>View selected</span>
          </label>
          <label class="filter-option">
            <input
              type="radio"
              name="filter-mode"
              value="unselected"
              checked={filterMode === "unselected"}
              onChange={() => handleFilterSelect("unselected")}
            />
            <span>View unselected</span>
          </label>
        </div>
      )}
    </div>
  );
}
