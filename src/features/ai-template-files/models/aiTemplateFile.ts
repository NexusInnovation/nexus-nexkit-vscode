/**
 * Operation modes for the extension
 */
export const OPERATION_MODES = ["Developers", "APM"] as const;

/**
 * Operation mode type
 */
export type OperationMode = (typeof OPERATION_MODES)[number];

/**
 * Represents an ai template file (md files for agents, prompts, instructions, chatmodes) from a github repository
 */
export interface AITemplateFile {
  name: string; // Filename (e.g., "python.agent.md") or folder name for directories
  type: AITemplateFileType; // type of the ai template file
  rawUrl: string; // Direct download URL
  repository: string; // Repository name
  repositoryUrl: string; // Repository URL
  isDirectory?: boolean; // True if this represents a folder structure (e.g., skills)
  sourcePath?: string; // GitHub API path for fetching folder contents
}

/**
 * Types of ai template files
 */
export const AI_TEMPLATE_FILE_TYPES = ["agents", "prompts", "skills", "instructions", "chatmodes"] as const;

/**
 * Types of ai template files
 */
export type AITemplateFileType = (typeof AI_TEMPLATE_FILE_TYPES)[number];

/**
 * Map of installed templates organized by type in the workspace
 * Each entry is a string in the format "repository::templateName"
 */
export type InstalledTemplatesMap = Record<AITemplateFileType, string[]>;

/**
 * Map of templates organized by repository and type
 */
export type RepositoryTemplatesMap = {
  name: string;
  modes?: OperationMode[];
  types: Record<AITemplateFileType, AITemplateFile[]>;
};
