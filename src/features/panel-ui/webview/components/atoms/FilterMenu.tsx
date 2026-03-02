import { useState, useEffect, useRef } from "preact/hooks";
import { FilterMode } from "../../types";

interface FilterMenuProps {
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  typeFilters: string[];
  onTypeFiltersChange: (types: string[]) => void;
  repositoryFilters: string[];
  onRepositoryFiltersChange: (repos: string[]) => void;
  availableTypes: string[];
  availableRepositories: string[];
}

const TYPE_DISPLAY_NAMES: Record<string, string> = {
  agents: "Agents",
  prompts: "Prompts",
  skills: "Skills",
  instructions: "Instructions",
  chatmodes: "Chat Modes",
};

/**
 * FilterMenu Component
 * Dropdown menu for filtering templates by installation status, type, and repository
 */
export function FilterMenu({
  filterMode,
  onFilterChange,
  typeFilters,
  onTypeFiltersChange,
  repositoryFilters,
  onRepositoryFiltersChange,
  availableTypes,
  availableRepositories,
}: FilterMenuProps) {
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
  };

  const handleTypeToggle = (type: string) => {
    if (typeFilters.includes(type)) {
      onTypeFiltersChange(typeFilters.filter((t) => t !== type));
    } else {
      onTypeFiltersChange([...typeFilters, type]);
    }
  };

  const handleRepoToggle = (repo: string) => {
    if (repositoryFilters.includes(repo)) {
      onRepositoryFiltersChange(repositoryFilters.filter((r) => r !== repo));
    } else {
      onRepositoryFiltersChange([...repositoryFilters, repo]);
    }
  };

  const hasActiveFilters = filterMode !== "all" || typeFilters.length > 0 || repositoryFilters.length > 0;

  return (
    <div class="filter-menu" ref={menuRef}>
      <button
        type="button"
        class={`filter-menu-btn ${hasActiveFilters ? "filter-active" : ""}`}
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
          <div class="dropdown-section-label">Status</div>
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

          {availableTypes.length > 0 && (
            <>
              <div class="dropdown-divider"></div>
              <div class="dropdown-section-label">Type</div>
              {availableTypes.map((type) => (
                <label class="filter-option" key={type}>
                  <input
                    type="checkbox"
                    checked={typeFilters.length === 0 || typeFilters.includes(type)}
                    onChange={() => handleTypeToggle(type)}
                  />
                  <span>{TYPE_DISPLAY_NAMES[type] || type}</span>
                </label>
              ))}
            </>
          )}

          {availableRepositories.length > 1 && (
            <>
              <div class="dropdown-divider"></div>
              <div class="dropdown-section-label">Repository</div>
              {availableRepositories.map((repo) => (
                <label class="filter-option" key={repo}>
                  <input
                    type="checkbox"
                    checked={repositoryFilters.length === 0 || repositoryFilters.includes(repo)}
                    onChange={() => handleRepoToggle(repo)}
                  />
                  <span>{repo}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
