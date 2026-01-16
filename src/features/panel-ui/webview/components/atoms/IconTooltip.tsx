import { useState } from "preact/hooks";
import { ComponentChildren } from "preact";

interface IconTooltipProps {
  /** Codicon name to display (without 'codicon-' prefix) */
  icon?: string;
  /** Tooltip content to display */
  children: ComponentChildren;
}

interface TooltipPosition {
  left: number;
  top: number;
  width: number;
}

/**
 * IconTooltip Component
 * Generic tooltip component that displays content when hovering over an icon
 */
export function IconTooltip({ icon = "info", children }: IconTooltipProps) {
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);

  const handleMouseEnter = (e: MouseEvent) => {
    setTooltipPosition({
      left: 12,
      top: e.clientY + 24,
      width: window.innerWidth - 24,
    });
  };

  const handleMouseLeave = () => {
    setTooltipPosition(null);
  };

  return (
    <>
      <span class="icon-tooltip" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        <i class={`codicon codicon-${icon}`}></i>
      </span>

      {tooltipPosition && (
        <div
          class="template-tooltip"
          style={{
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`,
            width: `${tooltipPosition.width}px`,
          }}
        >
          {children}
        </div>
      )}
    </>
  );
}
