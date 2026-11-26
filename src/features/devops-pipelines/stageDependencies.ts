import { parse } from "yaml";

/**
 * Extracts stage dependencies (stage name -> names of the stages it depends on) from a
 * template-expanded pipeline YAML.
 * A stage without `dependsOn` implicitly depends on the previous stage; `dependsOn: []` means none.
 * Returns undefined when the YAML declares no stages (single-stage or classic pipeline).
 */
export function parseStageDependencies(yamlText: string): Map<string, string[]> | undefined {
  let document: unknown;
  try {
    document = parse(yamlText);
  } catch {
    return undefined;
  }

  const stages = (document as { stages?: unknown } | null)?.stages;
  if (!Array.isArray(stages)) {
    return undefined;
  }

  const result = new Map<string, string[]>();
  let previous: string | undefined;
  for (const entry of stages) {
    const stage = entry as { stage?: unknown; dependsOn?: unknown } | null;
    if (!stage || typeof stage.stage !== "string") {
      continue;
    }

    let dependsOn: string[];
    if (!("dependsOn" in stage)) {
      dependsOn = previous ? [previous] : [];
    } else if (typeof stage.dependsOn === "string") {
      dependsOn = [stage.dependsOn];
    } else if (Array.isArray(stage.dependsOn)) {
      dependsOn = stage.dependsOn.filter((d): d is string => typeof d === "string");
    } else {
      dependsOn = [];
    }

    result.set(stage.stage, dependsOn);
    previous = stage.stage;
  }

  return result.size > 0 ? result : undefined;
}
