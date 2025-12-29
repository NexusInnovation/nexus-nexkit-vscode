import { AITemplateFileType } from "./aiTemplateFile";

/**
 * Represents a template that has been installed in the workspace
 * This is the source of truth for installed templates
 */
export interface InstalledTemplateRecord {
  /** Filename (e.g., "python.agent.md") */
  name: string;

  /** Type of template */
  type: AITemplateFileType;

  /** Repository name (e.g., "nexus-ai-templates") */
  repository: string;

  /** Repository URL */
  repositoryUrl: string;

  /** Direct download URL */
  rawUrl: string;

  /** Timestamp when template was installed */
  installedAt: number;
}

/**
 * Workspace state structure for installed templates
 */
export interface InstalledTemplatesState {
  /** List of installed template records */
  templates: InstalledTemplateRecord[];

  /** Timestamp of last filesystem sync */
  lastSyncedAt: number;
}
