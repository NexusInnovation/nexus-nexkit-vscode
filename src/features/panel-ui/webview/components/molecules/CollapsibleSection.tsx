import { JSX } from "preact";
import { useExpansionState } from "../../hooks/useExpansionState";

interface CollapsibleSectionProps {
  id: string;
  title: string;
  defaultExpanded?: boolean;
  children: JSX.Element | JSX.Element[];
}

/**
 * CollapsibleSection Component
 * Reusable collapsible section with border-based triangle indicator
 * Uses persistent expansion state across webview reloads
 */
export function CollapsibleSection({ id, title, defaultExpanded = false, children }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useExpansionState(id, defaultExpanded);

  const toggleExpansion = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div class="section">
      <div class="section-header collapsible" onClick={toggleExpansion}>
        <h2 class={isExpanded ? "expanded" : ""}>{title}</h2>
      </div>

      {isExpanded && <div class="section-content">{children}</div>}
    </div>
  );
}
