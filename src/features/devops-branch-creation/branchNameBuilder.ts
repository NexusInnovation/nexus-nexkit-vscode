import { AzureDevOpsWorkItem } from "./models/azureDevOpsWorkItem";

/** Max length of the title portion of a generated branch name. */
const TITLE_SLUG_MAX_LENGTH = 60;

/** Fallback used when the work item type slugifies to an empty string. */
const FALLBACK_TYPE_SLUG = "item";

/**
 * Maps normalized Azure DevOps work item type names to industry-standard branch prefixes.
 * Keys must be written in normalized form (lowercase, single-spaced) — see `normalizeTypeName`.
 * `hotfix`, `ci`, `release`, `refactor` are intentionally not mapped: no work item type maps 1:1 to them.
 */
const WORK_ITEM_TYPE_PREFIXES: Record<string, string> = {
  bug: "bugfix",
  issue: "bugfix",
  "user story": "feature",
  "product backlog item": "feature",
  requirement: "feature",
  feature: "feature",
  epic: "feature",
  improvement: "feature",
  poc: "experiment",
  spike: "experiment",
  "technical debt": "chore",
  task: "chore",
  impediment: "chore",
  risk: "chore",
  review: "chore",
  "change request": "chore",
  "test case": "test",
  documentation: "docs",
};

/**
 * Build a `{type}/{id}-{title}` (or `{type}/{id}` when the title has no usable slug)
 * branch name from an Azure DevOps work item.
 */
export function buildBranchName(workItem: AzureDevOpsWorkItem): string {
  const typeSlug = resolveTypePrefix(workItem.type);
  const titleSlug = slugify(workItem.title, TITLE_SLUG_MAX_LENGTH);

  return titleSlug ? `${typeSlug}/${workItem.id}-${titleSlug}` : `${typeSlug}/${workItem.id}`;
}

function resolveTypePrefix(type: string): string {
  const mapped = WORK_ITEM_TYPE_PREFIXES[normalizeTypeName(type)];

  return mapped ?? (slugify(type) || FALLBACK_TYPE_SLUG);
}

/** Lowercase, trim, and collapse internal whitespace/hyphens to a single space for table lookup. */
function normalizeTypeName(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ");
}

function slugify(value: string, maxLength?: number): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (maxLength && slug.length > maxLength) {
    return slug.substring(0, maxLength).replace(/-+$/g, "");
  }

  return slug;
}
