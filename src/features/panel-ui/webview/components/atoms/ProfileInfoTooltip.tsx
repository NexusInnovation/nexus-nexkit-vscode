import { Profile } from "../../../../profile-management/models/profile";
import { AITemplateFileType, AI_TEMPLATE_FILE_TYPES } from "../../../../ai-template-files/models/aiTemplateFile";
import { IconTooltip } from "./IconTooltip";

interface ProfileInfoTooltipProps {
  profile: Profile;
}

/**
 * Helper function to extract clean template name
 * Removes extension and type suffix (e.g., "python.agent.md" -> "python")
 */
function getCleanTemplateName(filename: string, type: AITemplateFileType): string {
  // Remove .md extension first
  let name = filename.replace(/\.md$/, "");

  // Remove type suffix (e.g., ".agent", ".prompt", etc.)
  const typeSuffix = `.${type.slice(0, -1)}`; // "agents" -> ".agent"
  name = name.replace(new RegExp(`${typeSuffix}$`), "");

  return name;
}

/**
 * ProfileInfoTooltip Component
 * Displays a tooltip with all templates in the profile, grouped by type
 */
export function ProfileInfoTooltip({ profile }: ProfileInfoTooltipProps) {
  // Group templates by type
  const templatesByType: Record<AITemplateFileType, string[]> = {
    agents: [],
    prompts: [],
    skills: [],
    instructions: [],
    chatmodes: [],
  };

  profile.templates.forEach((template) => {
    const cleanName = getCleanTemplateName(template.name, template.type);
    templatesByType[template.type].push(cleanName);
  });

  return (
    <IconTooltip>
      <div class="profile-tooltip-content">
        {AI_TEMPLATE_FILE_TYPES.map((type) => {
          const templates = templatesByType[type];

          // Only show type if it has templates
          if (templates.length === 0) {
            return null;
          }

          return (
            <div key={type} class="profile-tooltip-type">
              <div class="profile-tooltip-type-header">
                {type.charAt(0).toUpperCase() + type.slice(1)} ({templates.length})
              </div>
              <ul class="profile-tooltip-templates">
                {templates.map((templateName) => (
                  <li key={templateName}>{templateName}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </IconTooltip>
  );
}
