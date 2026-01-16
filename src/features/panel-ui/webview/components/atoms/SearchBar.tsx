interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * SearchBar Component
 * Search input with clear button
 */
export function SearchBar({ value, onChange }: SearchBarProps) {
  const handleClear = () => {
    onChange("");
  };

  return (
    <div class="search-wrapper">
      <input
        type="text"
        class="search-input"
        placeholder="Search templates..."
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
      {value && (
        <button class="search-clear-btn" title="Clear search" onClick={handleClear}>
          ✕
        </button>
      )}
    </div>
  );
}
