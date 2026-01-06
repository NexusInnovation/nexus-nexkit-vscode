import { useState } from "preact/hooks";
import { JSX } from "preact";

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: JSX.Element | JSX.Element[];
}

/**
 * CollapsibleSection Component
 * Reusable collapsible section with border-based triangle indicator
 */
export function CollapsibleSection({ title, defaultExpanded = false, children }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

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
