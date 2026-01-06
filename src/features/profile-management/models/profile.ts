import { InstalledTemplateRecord } from "../../ai-template-files/models/installedTemplateRecord";

/**
 * Represents a saved profile - a collection of templates that can be applied to a workspace
 */
export interface Profile {
  /** User-provided profile name (must be unique) */
  name: string;

  /** Collection of templates included in this profile */
  templates: InstalledTemplateRecord[];

  /** Timestamp when the profile was created */
  createdAt: number;

  /** Timestamp when the profile was last updated */
  updatedAt: number;
}

/**
 * Result of applying a profile to a workspace
 */
export interface ApplyProfileResult {
  /** Number of templates successfully installed */
  installed: number;

  /** Number of templates that were skipped (not found in repositories) */
  skipped: number;

  /** Names of templates that were skipped */
  skippedTemplates: string[];

  /** Path to the backup created before applying the profile */
  backupPath: string | null;
}
