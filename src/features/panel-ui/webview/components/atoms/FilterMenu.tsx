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
      >
        •••
      </button>
      {isOpen && (
        <div class="filter-dropdown" role="menu">
          <div
            class={`filter-option ${filterMode === "all" ? "selected" : ""}`}
            onClick={() => handleFilterSelect("all")}
            role="menuitem"
            tabIndex={0}
          >
            <span class="filter-radio" aria-hidden="true">{filterMode === "all" ? "●" : "○"}</span>
            View all
          </div>
          <div
            class={`filter-option ${filterMode === "selected" ? "selected" : ""}`}
            onClick={() => handleFilterSelect("selected")}
            role="menuitem"
            tabIndex={0}
          >
            <span class="filter-radio" aria-hidden="true">{filterMode === "selected" ? "●" : "○"}</span>
            View selected
          </div>
          <div
            class={`filter-option ${filterMode === "unselected" ? "selected" : ""}`}
            onClick={() => handleFilterSelect("unselected")}
            role="menuitem"
            tabIndex={0}
          >
            <span class="filter-radio" aria-hidden="true">{filterMode === "unselected" ? "●" : "○"}</span>
            View unselected
          </div>
        </div>
      )}
    </div>
  );
}
