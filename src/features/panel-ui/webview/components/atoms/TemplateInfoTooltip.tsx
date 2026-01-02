import { useState, useRef, useContext } from "preact/hooks";
import { AITemplateFile } from "../../../../ai-template-files/models/aiTemplateFile";
import { getTemplateKey, TemplateMetadataContext } from "../../contexts/TemplateMetadataContext";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";

interface TemplateInfoTooltipProps {
  template: AITemplateFile;
}

/**
 * TemplateInfoTooltip Component
 * Displays an info icon with a hover tooltip showing template metadata
 */
export function TemplateInfoTooltip({ template }: TemplateInfoTooltipProps) {
  const messenger = useVSCodeAPI();
  const context = useContext(TemplateMetadataContext);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0, width: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  if (!context) {
    throw new Error("TemplateInfoTooltip must be used within TemplateMetadataProvider");
  }

  const { cache, setCache } = context;
  const key = getTemplateKey(template);
  const metadataState = cache[key] || { metadata: null, loading: false, error: null };

  const handleMouseEnter = (e: MouseEvent) => {
    setTooltipPosition({
        left: 12,
        top: e.clientY + 24,
        width: window.innerWidth - 24,
    });
    
    setShowTooltip(true);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // If already in cache, don't set loading state
    if (!cache[key]) {
      setCache((prev) => ({
        ...prev,
        [key]: {
          metadata: null,
          loading: true,
          error: null,
        },
      }));
    }

    // Debounce the actual request by 100ms
    timeoutRef.current = setTimeout(() => {
      // Check if we need to fetch
      if (!cache[key]?.metadata && !cache[key]?.error) {
        messenger.sendMessage({
          command: "getTemplateMetadata",
          template,
        });
      }
      timeoutRef.current = null;
    }, 100);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);

    // Cancel pending fetch
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;

      // Reset loading state only if we haven't received data yet
      setCache((prev) => {
        if (prev[key] && prev[key].loading && !prev[key].metadata && !prev[key].error) {
          const newCache = { ...prev };
          delete newCache[key];
          return newCache;
        }
        return prev;
      });
    }
  };

  const tooltipContent = metadataState.loading
    ? { name: "", description: "", loading: true }
    : metadataState.error
    ? { name: "", description: "", error: metadataState.error }
    : metadataState.metadata
    ? { name: metadataState.metadata.name, description: metadataState.metadata.description }
    : null;

    return (
      <>
      <button
        class="template-info-button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-label="Show template information"
        type="button"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <path d="M7.5 7h1v4h-1V7z" fill="currentColor"/>
          <circle cx="8" cy="5" r="0.75" fill="currentColor"/>
        </svg>
      </button>

      {showTooltip && tooltipContent && (
        <div 
          class="template-tooltip"
          style={{
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`,
            width: `${tooltipPosition.width}px`,
          }}
        >
          {tooltipContent.loading ? (
            <div class="tooltip-loading">Loading...</div>
          ) : tooltipContent.error ? (
            <div class="tooltip-error">Error: {tooltipContent.error}</div>
          ) : (
            <>
              <div class="tooltip-name">{tooltipContent.name}</div>
              {tooltipContent.description && <div class="tooltip-description">{tooltipContent.description}</div>}
            </>
          )}
        </div>
      )}</>
  );
}
