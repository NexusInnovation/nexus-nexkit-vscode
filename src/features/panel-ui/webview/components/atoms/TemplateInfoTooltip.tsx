import { useRef, useContext, useEffect } from "preact/hooks";
import { AITemplateFile } from "../../../../ai-template-files/models/aiTemplateFile";
import { getTemplateKey, TemplateMetadataContext } from "../../contexts/TemplateMetadataContext";
import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { IconTooltip } from "./IconTooltip";

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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);

  if (!context) {
    throw new Error("TemplateInfoTooltip must be used within TemplateMetadataProvider");
  }

  const { cache, setCache } = context;
  const key = getTemplateKey(template);
  const metadataState = cache[key] || { metadata: null, loading: false, error: null };

  // Fetch metadata when hovering starts
  const handleHoverStart = () => {
    isHoveringRef.current = true;

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
      // Check if we need to fetch and still hovering
      if (isHoveringRef.current && !cache[key]?.metadata && !cache[key]?.error) {
        messenger.sendMessage({
          command: "getTemplateMetadata",
          template,
        });
      }
      timeoutRef.current = null;
    }, 100);
  };

  const handleHoverEnd = () => {
    isHoveringRef.current = false;

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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const tooltipContent = metadataState.loading ? (
    <div class="tooltip-loading">Loading...</div>
  ) : metadataState.error ? (
    <div class="tooltip-error">Error: {metadataState.error}</div>
  ) : metadataState.metadata ? (
    <>
      <div class="tooltip-name">{metadataState.metadata.name}</div>
      {metadataState.metadata.description && <div class="tooltip-description">{metadataState.metadata.description}</div>}
    </>
  ) : null;

  return (
    <div onMouseEnter={handleHoverStart} onMouseLeave={handleHoverEnd}>
      <IconTooltip>{tooltipContent}</IconTooltip>
    </div>
  );
}
