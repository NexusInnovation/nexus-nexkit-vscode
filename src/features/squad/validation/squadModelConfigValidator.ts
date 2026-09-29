/**
 * Pure validator and serializer for `.squad/model-config.json` (SQD-028, FR-063).
 *
 * Dependency-free (no `vscode`, no file system) so the host read/write services
 * and the webview can share the same JSON/schema rules. Unknown top-level keys
 * are tolerated for forward compatibility with newer Squad CLI versions.
 */

import type { SquadAgentModelConfig } from "../models/squadConfig";
import { SquadModelConfig, SQUAD_MODEL_CONFIG_RELATIVE_PATH } from "../models/squadModelConfig";
import { squadErr, squadOk, SquadResult } from "../models/squadResult";

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MODEL_ID_PATTERN = /^[^\s\u0000-\u001f\u007f]+$/;
const MAX_IDENTIFIER_LENGTH = 200;

const SHAPE_REMEDIATION =
  'Use { "default": "<model>", "overrides": { "<agent-id>": "<model>" } } — both keys are optional, model ids ' +
  "must be non-empty strings without spaces, and agent ids must match the folder names under .squad/agents/.";

/**
 * Parse and validate raw `.squad/model-config.json` content.
 *
 * Returns a `parse-failed` {@link SquadResult} failure when the content is not
 * valid JSON or does not match the expected shape. Every schema issue is
 * listed in `error.detail` so the user can fix them in one pass.
 */
export function parseSquadModelConfig(content: string): SquadResult<SquadModelConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return squadErr({
      code: "parse-failed",
      message: `The Squad model configuration (${SQUAD_MODEL_CONFIG_RELATIVE_PATH}) is not valid JSON.`,
      remediation: `Fix the JSON syntax in ${SQUAD_MODEL_CONFIG_RELATIVE_PATH}. ${SHAPE_REMEDIATION}`,
      detail: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }

  const issues: string[] = [];
  const config = collectModelConfig(parsed, issues);
  if (issues.length > 0 || !config) {
    return squadErr({
      code: "parse-failed",
      message: `The Squad model configuration (${SQUAD_MODEL_CONFIG_RELATIVE_PATH}) has an invalid shape.`,
      remediation: SHAPE_REMEDIATION,
      detail: issues.join("; "),
    });
  }

  return squadOk(config);
}

/**
 * Serialize a {@link SquadModelConfig} to the canonical Squad JSON shape
 * (2-space indent, trailing newline). Intended for structured editors that
 * build the config from form fields before sending it to the host.
 */
export function serializeSquadModelConfig(config: SquadModelConfig): string {
  const overrides = Object.fromEntries(config.overrides.map((entry) => [entry.agentId, entry.model]));
  const document: Record<string, unknown> = {};
  if (config.defaultModel !== undefined) {
    document.default = config.defaultModel;
  }
  document.overrides = overrides;
  return `${JSON.stringify(document, null, 2)}\n`;
}

function collectModelConfig(parsed: unknown, issues: string[]): SquadModelConfig | undefined {
  if (!isPlainObject(parsed)) {
    issues.push("The root value must be a JSON object.");
    return undefined;
  }

  const config: SquadModelConfig = { overrides: [] };

  const defaultModel = parsed.default;
  if (defaultModel !== undefined && defaultModel !== null) {
    const modelIssue = describeModelIssue(defaultModel);
    if (modelIssue) {
      issues.push(`"default" ${modelIssue}`);
    } else {
      config.defaultModel = defaultModel as string;
    }
  }

  const overrides = parsed.overrides;
  if (overrides === undefined || overrides === null) {
    return config;
  }
  if (!isPlainObject(overrides)) {
    issues.push('"overrides" must be an object mapping agent ids to model ids.');
    return config;
  }

  const seenAgentIds = new Map<string, string>();
  for (const [agentId, model] of Object.entries(overrides)) {
    if (!isValidAgentId(agentId)) {
      issues.push(`Override key "${agentId}" is not a valid agent id (letters, digits, ".", "_" or "-" only).`);
      continue;
    }
    const normalizedId = agentId.toLowerCase();
    const previous = seenAgentIds.get(normalizedId);
    if (previous !== undefined) {
      issues.push(`Override for agent "${agentId}" duplicates "${previous}".`);
      continue;
    }
    seenAgentIds.set(normalizedId, agentId);

    const modelIssue = describeModelIssue(model);
    if (modelIssue) {
      issues.push(`Override for agent "${agentId}" ${modelIssue}`);
      continue;
    }
    const entry: SquadAgentModelConfig = { agentId, model: model as string };
    config.overrides.push(entry);
  }

  return config;
}

function describeModelIssue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return "must be a string model id.";
  }
  if (value.length === 0) {
    return "must not be empty.";
  }
  if (value.length > MAX_IDENTIFIER_LENGTH) {
    return `must be at most ${MAX_IDENTIFIER_LENGTH} characters.`;
  }
  if (!MODEL_ID_PATTERN.test(value)) {
    return "must not contain spaces or control characters.";
  }
  return undefined;
}

function isValidAgentId(agentId: string): boolean {
  return agentId.length <= MAX_IDENTIFIER_LENGTH && AGENT_ID_PATTERN.test(agentId) && !agentId.includes("..");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
