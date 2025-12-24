/**
 * TemplateItem Component
 * Individual template checkbox with label
 */

import { useState } from "preact/hooks";
import { TemplateFileData } from "../types";

interface TemplateItemProps {
  template: TemplateFileData;
  isInstalled: boolean;
  onInstall: (template: TemplateFileData) => void;
  onUninstall: (template: TemplateFileData) => void;
}

export function TemplateItem({
  template,
  isInstalled,
  onInstall,
  onUninstall,
}: TemplateItemProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleChange = async (e: Event) => {
    const checked = (e.target as HTMLInputElement).checked;
    setIsProcessing(true);

    try {
      if (checked) {
        onInstall(template);
      } else {
        onUninstall(template);
      }
      // Note: The checkbox state will be updated when the installed templates list is refreshed
    } catch (error) {
      console.error("Failed to change template state:", error);
    } finally {
      // Keep disabled until the state refresh comes through
      // The parent component will re-render with the new state
      setTimeout(() => setIsProcessing(false), 500);
    }
  };

  const templateId = `template-${template.repository}::${template.type}::${template.name}`;
  const displayName = template.name.replace(/\.md$/, "");

  return (
    <div class="template-item">
      <input
        type="checkbox"
        id={templateId}
        class="template-checkbox"
        checked={isInstalled}
        disabled={isProcessing}
        onChange={handleChange}
      />
      <label htmlFor={templateId} class="template-label">
        {displayName}
      </label>
    </div>
  );
}
