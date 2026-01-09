import { AITemplateFile } from "../../../../ai-template-files/models/aiTemplateFile";
import { TemplateInfoTooltip } from "./TemplateInfoTooltip";

interface TemplateItemProps {
  template: AITemplateFile;
  isInstalled: boolean;
  onInstall: (template: AITemplateFile) => void;
  onUninstall: (template: AITemplateFile) => void;
}

/**
 * TemplateItem Component
 * Individual template checkbox with label and info tooltip
 */
export function TemplateItem({ template, isInstalled, onInstall, onUninstall }: TemplateItemProps) {
  const handleChange = async (e: Event) => {
    const checked = (e.target as HTMLInputElement).checked;

    try {
      if (checked) {
        onInstall(template);
      } else {
        onUninstall(template);
      }
    } catch (error) {
      console.error("Failed to change template state:", error);
    }
  };

  const templateId = `template-${template.repository}::${template.type}::${template.name}`;
  const displayName = template.name.replace(/\.md$/, "");

  return (
    <div class="template-item">
      <input type="checkbox" id={templateId} class="template-checkbox" checked={isInstalled} onChange={handleChange} />
      <label htmlFor={templateId} class="template-label">
        {displayName}
      </label>

      <TemplateInfoTooltip template={template} />
    </div>
  );
}
