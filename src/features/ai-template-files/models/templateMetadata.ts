/**
 * Metadata extracted from a template file
 */
export interface TemplateMetadata {
  name: string; // Display name from frontmatter or filename fallback
  description: string; // Description from frontmatter or empty string
}
