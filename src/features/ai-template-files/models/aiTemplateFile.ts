/**
 * Represents an ai template file (md files for agents, prompts, instructions, chatmodes) from a github repository
 */
export interface AITemplateFile {
  name: string; // Filename (e.g., "python.agent.md")
  type: AITemplateFileType; // type of the ai template file
  rawUrl: string; // Direct download URL
  repository: string; // Repository name
  repositoryUrl: string; // Repository URL
}

/**
 * Types of ai template files
 */
export const AI_TEMPLATE_FILE_TYPES = ["agents", "prompts", "instructions", "chatmodes"] as const;

/**
 * Types of ai template files
 */
export type AITemplateFileType = (typeof AI_TEMPLATE_FILE_TYPES)[number];

/**
 * Map of installed templates organized by type in the workspace
 */
export type InstalledTemplatesMap = Record<AITemplateFileType, string[]>;

/**
 * Map of templates organized by repository and type
 */
export type RepositoryTemplatesMap = {
  name: string;
  types: Record<AITemplateFileType, AITemplateFile[]>;
};
