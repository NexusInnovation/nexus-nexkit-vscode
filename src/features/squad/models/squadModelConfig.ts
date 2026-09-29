/**
 * Domain types for the per-agent Squad model configuration (FR-063, SQD-028).
 *
 * Mirrors `.squad/model-config.json` as written by the Squad CLI:
 *
 * ```json
 * { "default": "gpt-5.6-terra", "overrides": { "neo": "gpt-5.6-sol" } }
 * ```
 *
 * Model identifiers are opaque strings — NexKit validates the JSON shape, not
 * provider-specific model availability.
 */

import type { SquadAgentModelConfig } from "./squadConfig";

/** Workspace-root-relative POSIX path of the Squad model configuration file. */
export const SQUAD_MODEL_CONFIG_RELATIVE_PATH = ".squad/model-config.json";

/** Parsed, validated view of `.squad/model-config.json`. */
export interface SquadModelConfig {
  /** Team-wide default model (`default`), when configured. */
  defaultModel?: string;

  /** Per-agent overrides (`overrides`), in file order. */
  overrides: SquadAgentModelConfig[];
}

/**
 * The model configuration document surfaced in the panel. Raw content is kept
 * so the user can view and fix an invalid file from the panel; {@link config}
 * is only set when the content passed validation.
 */
export interface SquadModelConfigDocument {
  /** Workspace-root-relative path (`.squad/model-config.json`). */
  relativePath: string;

  /** Whether the file exists in the workspace. */
  exists: boolean;

  /** Raw JSON content, or an empty string when {@link exists} is false. */
  content: string;

  /**
   * Validated configuration, or `null` when the file is absent or invalid.
   * An invalid file is always accompanied by a visible `squadError`.
   */
  config: SquadModelConfig | null;
}
