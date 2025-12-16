/**
 * Categories of content available for items
 */
export const CATEGORIES = [
  "agents",
  "prompts",
  "instructions",
  "chatmodes",
] as const;

/**
 * Categories of content available for items
 */
export type ItemCategory = typeof CATEGORIES[number];