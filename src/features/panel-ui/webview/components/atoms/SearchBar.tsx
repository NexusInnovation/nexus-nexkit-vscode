interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Whether the metadata scan is currently in progress */
  isScanning?: boolean;
  /** Whether the metadata scan has completed */
  isScanComplete?: boolean;
}

/**
 * SearchBar Component
 * Search input with clear button and scan status indicator
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "Search templates...",
  isScanning = false,
  isScanComplete = false,
}: SearchBarProps) {
  const handleClear = () => {
    onChange("");
  };

  return (
    <div class="search-wrapper">
      <input
        type="text"
        class="search-input"
        placeholder={placeholder}
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
      {value && (
        <button class="search-clear-btn" title="Clear search" onClick={handleClear}>
          ✕
        </button>
      )}
      {isScanning && (
        <div class="search-scan-indicator" title="Scanning template metadata for enhanced search...">
          <span class="search-scan-spinner" />
          <span class="search-scan-text">Indexing…</span>
        </div>
      )}
      {!isScanning && isScanComplete && (
        <div class="search-scan-indicator search-scan-ready" title="Searching by name and description">
          <span class="search-scan-text">✦ Enhanced search</span>
        </div>
      )}
      {!isScanning && !isScanComplete && (
        <div class="search-scan-indicator search-scan-limited" title="Metadata not yet loaded — searching by filename only">
          <span class="search-scan-text">Filename only</span>
        </div>
      )}
    </div>
  );
}
