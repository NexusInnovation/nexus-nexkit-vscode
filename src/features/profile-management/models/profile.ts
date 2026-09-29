import { InstalledTemplateRecord } from "../../ai-template-files/models/installedTemplateRecord";
import { BatchInstallSummary } from "../../ai-template-files/services/templateFileOperations";
import { SquadProfileConfig } from "../../squad/models";
import { SquadProfileApplyOutcome } from "../../squad/services/squadProfileService";

/**
 * Represents a saved profile - a collection of templates that can be applied to a workspace
 */
export interface Profile {
  /** User-provided profile name (must be unique) */
  name: string;

  /** Collection of templates included in this profile */
  templates: InstalledTemplateRecord[];

  /** Optional Squad configuration captured with this profile (FR-065). */
  squad?: SquadProfileConfig;

  /** Timestamp when the profile was created */
  createdAt: number;

  /** Timestamp when the profile was last updated */
  updatedAt: number;
}

/**
 * Result of applying a profile to a workspace
 */
export interface ApplyProfileResult {
  /** Summary of the batch installation process */
  summary: BatchInstallSummary;

  /** Path to the backup created before applying the profile */
  backupPath: string | null;

  /** Result of applying the optional Squad configuration section. */
  squad?: SquadProfileApplyOutcome;
}
